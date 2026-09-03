import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AdobeFireflyError,
  buildAdobeArpSessionId,
  extractAdobeArpSessionId,
  extractAdobeCookieHeader,
  extractAdobeCredentialToken,
  isAdobeUserAccessToken,
  looksLikeAdobeCookieBlob,
  looksLikeAdobeJwt,
  decodeAdobeJwtPayload,
  resolveAdobeAccessToken,
  exchangeAdobeCookieForAccessToken
} from "./adobeFireflyClient.js";
const sessionCache = /* @__PURE__ */ new Map();
const browserRefreshInFlight = /* @__PURE__ */ new Map();
const lastWorkingArpByFingerprint = /* @__PURE__ */ new Map();
const browserWarmFailureCooldown = /* @__PURE__ */ new Map();
const BROWSER_WARM_FAIL_COOLDOWN_MS = 9e4;
let adobeSubmitChain = Promise.resolve();
let lastAdobeSubmitAt = 0;
const WORKING_ARP_STICKY_MS = 25 * 6e4;
const FORTER_STALE_MS = 4 * 6e4;
const BATCH_SUCCESS_COOLDOWN_EVERY = 3;
const BATCH_SUCCESS_EXTRA_GAP_MS = 15e3;
let consecutiveAdobeSubmitSuccesses = 0;
function minSubmitGapMs() {
  if (process.env.ADOBE_FIREFLY_MIN_SUBMIT_GAP_MS != null && process.env.ADOBE_FIREFLY_MIN_SUBMIT_GAP_MS !== "") {
    return Math.max(0, Number(process.env.ADOBE_FIREFLY_MIN_SUBMIT_GAP_MS) || 0);
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST || process.env.NODE_TEST_CONTEXT)
    return 0;
  return 12e3;
}
function batchExtraGapMs() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST || process.env.NODE_TEST_CONTEXT)
    return 0;
  if (consecutiveAdobeSubmitSuccesses > 0 && consecutiveAdobeSubmitSuccesses % BATCH_SUCCESS_COOLDOWN_EVERY === 0) {
    return Number(process.env.ADOBE_FIREFLY_BATCH_EXTRA_GAP_MS || BATCH_SUCCESS_EXTRA_GAP_MS);
  }
  return 0;
}
const JWT_REFRESH_SKEW_MS = 10 * 6e4;
const FORTER_PROACTIVE_WARM_MS = 3 * 6e4;
function adobeFireflyBrowserEnabled() {
  return process.env.ADOBE_FIREFLY_BROWSER_REFRESH !== "0";
}
const SESSION_DIR_NAME = "adobe-firefly-sessions";
function dataDir() {
  return String(process.env.DATA_DIR || process.env.OMNIROUTE_DATA_DIR || "").trim() || join(process.cwd(), ".data");
}
function sessionFilePath(fingerprint) {
  const dir = join(dataDir(), SESSION_DIR_NAME);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
  }
  return join(dir, `${fingerprint}.json`);
}
function fingerprintAdobeCredential(raw) {
  return createHash("sha256").update(String(raw || "").trim()).digest("hex").slice(0, 32);
}
function getAdobeCookieValue(cookieOrBlob, name) {
  const raw = String(cookieOrBlob || "");
  if (!raw || !name) return "";
  const re = new RegExp(
    `(?:^|[;\\s\\n\\r])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}=([^;\\s\\n\\r]+)`,
    "i"
  );
  const m = raw.match(re);
  if (!m?.[1]) return "";
  let v = m[1].trim().replace(/^["']|["']$/g, "");
  try {
    if (/%[0-9A-Fa-f]{2}/.test(v)) v = decodeURIComponent(v);
  } catch {
  }
  return v;
}
function normalizeAdobeForterToken(value) {
  let f = String(value || "").trim();
  if (!f) return "";
  try {
    if (/%[0-9A-Fa-f]{2}/.test(f)) f = decodeURIComponent(f);
  } catch {
  }
  if (/^[a-f0-9]{32},\d+$/i.test(f)) return "";
  if (f.endsWith("v2") && !f.endsWith("v2_tt")) f = `${f}_tt`;
  return f;
}
function extractAdobeForterTimestampMs(cookieOrBlob) {
  const ftr = normalizeAdobeForterToken(getAdobeCookieValue(cookieOrBlob, "forterToken")) || normalizeAdobeForterToken(getAdobeCookieValue(cookieOrBlob, "forter")) || "";
  const m = ftr.match(/_(\d{13})__/);
  return m ? Number(m[1]) : 0;
}
function getAdobeForterAgeMs(cookieOrBlob) {
  const ts = extractAdobeForterTimestampMs(cookieOrBlob);
  if (!ts) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - ts);
}
function markAdobeFireflyArpSuccess(fingerprint, arpSessionId) {
  const fp = String(fingerprint || "").trim();
  const arp = String(arpSessionId || "").trim();
  if (!fp || !arp) return;
  lastWorkingArpByFingerprint.set(fp, { arp, at: Date.now() });
  consecutiveAdobeSubmitSuccesses += 1;
  const cached = sessionCache.get(fp);
  if (cached) {
    cached.arpSessionId = arp;
    cached.updatedAt = Date.now();
    sessionCache.set(fp, cached);
    saveDiskSession(cached);
  } else {
    try {
      const path = sessionFilePath(fp);
      if (existsSync(path)) {
        const obj = JSON.parse(readFileSync(path, "utf8"));
        obj.arpSessionId = arp;
        obj.updatedAt = Date.now();
        writeFileSync(path, JSON.stringify(obj, null, 2), "utf8");
        sessionCache.set(fp, { ...obj, fingerprint: fp });
      }
    } catch {
    }
  }
}
function clearAdobeFireflyWorkingArp(fingerprint) {
  lastWorkingArpByFingerprint.delete(String(fingerprint || "").trim());
}
function noteAdobeFireflySubmitFailure() {
  consecutiveAdobeSubmitSuccesses = 0;
}
async function withAdobeFireflySubmitGate(fn) {
  const run = adobeSubmitChain.then(async () => {
    const gap = minSubmitGapMs() + batchExtraGapMs();
    const wait = Math.max(0, lastAdobeSubmitAt + gap - Date.now());
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      return await fn();
    } finally {
      lastAdobeSubmitAt = Date.now();
    }
  });
  adobeSubmitChain = run.then(
    () => void 0,
    () => void 0
  );
  return run;
}
function buildAdobeArpSessionIdFromCookies(cookieOrBlob, extras) {
  const blob = String(cookieOrBlob || "");
  if (!blob.trim()) return "";
  const sid = getAdobeCookieValue(blob, "ff_session_guid") || getAdobeCookieValue(blob, "sid") || "";
  const ark = getAdobeCookieValue(blob, "arkose") || "";
  const ftr = normalizeAdobeForterToken(getAdobeCookieValue(blob, "forterToken")) || normalizeAdobeForterToken(getAdobeCookieValue(blob, "forter")) || "";
  if (!sid || !ark || !ftr) return "";
  let bfp = extras?.bfp || getAdobeCookieValue(blob, "bfp") || "";
  let fpjsRaw = extras?.fpjs || getAdobeCookieValue(blob, "fpjs") || "";
  if (fpjsRaw) {
    try {
      if (/%[0-9A-Fa-f]{2}/.test(fpjsRaw)) fpjsRaw = decodeURIComponent(fpjsRaw);
    } catch {
    }
  }
  const obj = { sid, ark, ftr };
  if (bfp) obj.bfp = bfp;
  if (fpjsRaw) obj.fpjs = fpjsRaw;
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}
function canRebuildAdobeArpFromCookies(cookieOrBlob) {
  return Boolean(buildAdobeArpSessionIdFromCookies(cookieOrBlob));
}
function resolveAdobeArpSessionIdSmart(cookieOrBlob, opts) {
  const blob = String(cookieOrBlob || "");
  if (opts?.rotate) {
    const rebuilt2 = buildAdobeArpSessionIdFromCookies(blob);
    if (rebuilt2) return rebuilt2;
    return buildAdobeArpSessionId();
  }
  const rebuilt = buildAdobeArpSessionIdFromCookies(blob);
  const extracted = extractAdobeArpSessionId(blob);
  if (rebuilt && extracted) {
    const rebuiltFtr = (() => {
      try {
        const j = JSON.parse(
          Buffer.from(rebuilt + "=".repeat((4 - rebuilt.length % 4) % 4), "base64").toString(
            "utf8"
          )
        );
        return String(j.ftr || "");
      } catch {
        return "";
      }
    })();
    const extractedFtr = (() => {
      try {
        const j = JSON.parse(
          Buffer.from(extracted + "=".repeat((4 - extracted.length % 4) % 4), "base64").toString(
            "utf8"
          )
        );
        return String(j.ftr || "");
      } catch {
        return "";
      }
    })();
    const ts = (ftr) => {
      const m = ftr.match(/_(\d{13})__/);
      return m ? Number(m[1]) : 0;
    };
    if (ts(rebuiltFtr) >= ts(extractedFtr)) return rebuilt;
    return extracted;
  }
  if (rebuilt) return rebuilt;
  if (extracted) return extracted;
  return buildAdobeArpSessionId();
}
function mergeAdobeCookieHeaders(base, updates) {
  const map = /* @__PURE__ */ new Map();
  const ingest = (raw) => {
    for (const part of String(raw || "").split(";")) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      let name = part.slice(0, idx).trim();
      let value = part.slice(idx + 1).trim();
      if (!name) continue;
      try {
        name = decodeURIComponent(name);
      } catch {
      }
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      if (/[\r\n\0]/.test(value)) continue;
      map.set(name, value);
    }
  };
  ingest(extractAdobeCookieHeader(base) || base);
  ingest(extractAdobeCookieHeader(updates) || updates);
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function serializeAdobeFireflyCredential(session) {
  const lines = [];
  if (session.accessToken) lines.push(session.accessToken.trim());
  if (session.arpSessionId) lines.push(session.arpSessionId.trim());
  if (session.cookie) lines.push(session.cookie.trim());
  return lines.join("\n");
}
function estimateAdobeTokenExpiry(accessToken) {
  const payload = decodeAdobeJwtPayload(accessToken);
  if (!payload) return Date.now() + 60 * 6e4;
  const created = Number(payload.created_at || 0);
  const expiresIn = Number(payload.expires_in || 0);
  if (created > 0 && expiresIn > 0) return created + expiresIn;
  return Date.now() + 20 * 60 * 6e4;
}
function diskSessionsEnabled() {
  if (process.env.ADOBE_FIREFLY_SESSION_DISK === "0") return false;
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.VITEST || process.env.NODE_TEST_CONTEXT) return false;
  return true;
}
function loadDiskSession(fingerprint) {
  if (!diskSessionsEnabled()) return null;
  try {
    const path = sessionFilePath(fingerprint);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const obj = JSON.parse(raw);
    if (!obj?.accessToken || !isAdobeUserAccessToken(obj.accessToken)) return null;
    return { ...obj, fingerprint, source: "cache" };
  } catch {
    return null;
  }
}
function saveDiskSession(session) {
  if (!diskSessionsEnabled()) return;
  try {
    const path = sessionFilePath(session.fingerprint);
    writeFileSync(path, JSON.stringify(session, null, 2), "utf8");
  } catch {
  }
}
function collectCredentialBlobs(credentials) {
  const out = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };
  push(credentials?.apiKey);
  push(credentials?.accessToken);
  push(credentials?.providerSpecificData?.cookie);
  push(credentials?.providerSpecificData?.access_token);
  push(credentials?.providerSpecificData?.accessToken);
  return out;
}
async function writeBackAdobeFireflyCredentials(session, log) {
  const connectionId = String(session.browserSessionKey || "").trim();
  if (!connectionId || connectionId === "legacy-default") return;
  if (!isAdobeUserAccessToken(session.accessToken)) return;
  try {
    const { updateProviderConnection } = await import("@/lib/db/providers");
    const credential = serializeAdobeFireflyCredential(session);
    await updateProviderConnection(connectionId, {
      apiKey: credential,
      providerSpecificData: {
        mode: "browser-profile",
        adobeFireflyMode: "browser-profile",
        cookie: session.cookie || credential,
        access_token: session.accessToken,
        browserSessionKey: connectionId,
        arpSessionId: session.arpSessionId || "",
        refreshedAt: Date.now()
      }
    });
    log?.info?.(
      "ADOBE-FIREFLY",
      `wrote refreshed JWT+Cookie to connection ${connectionId.slice(0, 8)}\u2026`
    );
  } catch (err) {
    log?.warn?.(
      "ADOBE-FIREFLY",
      `credential write-back skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function refreshAdobeSessionViaBrowser(session, log, opts) {
  const force = opts?.force === true;
  if (!adobeFireflyBrowserEnabled()) return null;
  const coolKey = String(session.browserSessionKey || session.fingerprint || "").trim();
  const coolUntil = coolKey ? browserWarmFailureCooldown.get(coolKey) || 0 : 0;
  if (force && coolUntil > Date.now()) {
    log?.warn?.(
      "ADOBE-FIREFLY",
      `skip CDP warm (cooldown ${Math.ceil((coolUntil - Date.now()) / 1e3)}s after recent failure)`
    );
    return null;
  }
  try {
    const baseFtr = extractAdobeForterTimestampMs(session.cookie || "");
    const { refreshAdobeFireflyViaCdp } = await import("./adobeFireflyBrowserLogin.js");
    const warmed = await refreshAdobeFireflyViaCdp({
      cookie: session.cookie,
      accessToken: session.accessToken,
      log,
      timeoutMs: force ? 9e4 : 75e3,
      sessionKey: session.browserSessionKey || session.fingerprint
    });
    if (!warmed) {
      if (force && coolKey) {
        browserWarmFailureCooldown.set(coolKey, Date.now() + BROWSER_WARM_FAIL_COOLDOWN_MS);
      }
      return null;
    }
    if (coolKey) browserWarmFailureCooldown.delete(coolKey);
    const nextCookie = force ? warmed.cookie || session.cookie : warmed.cookie ? mergeAdobeCookieHeaders(session.cookie || "", warmed.cookie) : session.cookie;
    const warmFtr = extractAdobeForterTimestampMs(nextCookie);
    const warmAge = warmFtr > 0 ? Math.max(0, Date.now() - warmFtr) : Number.POSITIVE_INFINITY;
    if (force) {
      const advanced = warmFtr > 0 && (baseFtr <= 0 || warmFtr > baseFtr || warmAge < FORTER_STALE_MS);
      if (!advanced) {
        log?.warn?.(
          "ADOBE-FIREFLY",
          `CDP warm rejected: forter not advanced (base=${baseFtr}, warm=${warmFtr || 0}, ageMs=${Number.isFinite(warmAge) ? warmAge : "inf"})`
        );
        return null;
      }
    }
    const nextArp = warmed.arpSessionId || buildAdobeArpSessionIdFromCookies(nextCookie) || extractAdobeArpSessionId(nextCookie);
    if (!nextArp) return null;
    const nextToken = (warmed.accessToken && isAdobeUserAccessToken(warmed.accessToken) ? warmed.accessToken : "") || session.accessToken;
    if (!isAdobeUserAccessToken(nextToken)) return null;
    const next = {
      ...session,
      accessToken: nextToken,
      cookie: nextCookie,
      arpSessionId: nextArp,
      tokenExpiresAt: estimateAdobeTokenExpiry(nextToken),
      updatedAt: Date.now(),
      browserSessionKey: session.browserSessionKey || session.fingerprint,
      source: "browser"
    };
    sessionCache.set(session.fingerprint, next);
    saveDiskSession(next);
    clearAdobeFireflyWorkingArp(session.fingerprint);
    void writeBackAdobeFireflyCredentials(next, log);
    log?.info?.(
      "ADOBE-FIREFLY",
      `durable CDP warm refreshed session (arpLen=${next.arpSessionId.length}, force=${force}, forterTs=${warmFtr || 0}, forterDeltaMs=${warmFtr && baseFtr ? warmFtr - baseFtr : 0})`
    );
    return next;
  } catch (err) {
    if (force && coolKey) {
      browserWarmFailureCooldown.set(coolKey, Date.now() + BROWSER_WARM_FAIL_COOLDOWN_MS);
    }
    log?.warn?.(
      "ADOBE-FIREFLY",
      `browser CDP session refresh failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
async function ensureAdobeFireflySession(opts) {
  const blobs = collectCredentialBlobs(opts.credentials);
  if (blobs.length === 0) {
    throw new AdobeFireflyError(
      "Adobe Firefly credentials missing. Paste the IMS JWT (Authorization: Bearer on firefly-3p) and ideally the full firefly.adobe.com Cookie (with sherlockToken / forterToken / arkose) once.",
      401,
      "missing_credentials"
    );
  }
  const joined = blobs.join("\n");
  const connectionId = String(
    opts.credentials?.connectionId || opts.credentials?.providerSpecificData?.browserSessionKey || ""
  ).trim();
  const fingerprint = connectionId ? fingerprintAdobeCredential(`conn:${connectionId}`) : fingerprintAdobeCredential(joined);
  const browserSessionKey = connectionId || fingerprint;
  if (opts.forceRefresh) sessionCache.delete(fingerprint);
  const legacyFingerprint = fingerprintAdobeCredential(joined);
  const cached = sessionCache.get(fingerprint) || loadDiskSession(fingerprint) || (legacyFingerprint !== fingerprint ? loadDiskSession(legacyFingerprint) : null);
  if (cached && !opts.forceRefresh) {
    const normalized = {
      ...cached,
      fingerprint,
      browserSessionKey: cached.browserSessionKey || browserSessionKey
    };
    sessionCache.set(fingerprint, normalized);
  }
  const fetchImpl = opts.fetchImpl || fetch;
  let accessToken = "";
  let cookie = "";
  let pasteHadUserJwt = false;
  for (const b of blobs) {
    const tok = extractAdobeCredentialToken(b);
    if (looksLikeAdobeJwt(tok) && isAdobeUserAccessToken(tok)) {
      accessToken = tok;
      pasteHadUserJwt = true;
      break;
    }
  }
  const pastedExpiresAt = accessToken ? estimateAdobeTokenExpiry(accessToken) : 0;
  const cachedExpiresAt = cached?.accessToken ? cached.tokenExpiresAt > 0 ? cached.tokenExpiresAt : estimateAdobeTokenExpiry(cached.accessToken) : 0;
  if (cached?.accessToken && isAdobeUserAccessToken(cached.accessToken) && cachedExpiresAt - Date.now() >= JWT_REFRESH_SKEW_MS && (!accessToken || pastedExpiresAt - Date.now() < JWT_REFRESH_SKEW_MS)) {
    accessToken = cached.accessToken;
    pasteHadUserJwt = false;
  }
  for (const b of blobs) {
    const c = extractAdobeCookieHeader(b);
    if (c) {
      cookie = c;
      break;
    }
    if (looksLikeAdobeCookieBlob(b)) {
      cookie = extractAdobeCookieHeader(b) || b;
      break;
    }
  }
  if (!cookie && cached?.cookie) cookie = cached.cookie;
  if (cached?.cookie && cookie) cookie = mergeAdobeCookieHeaders(cached.cookie, cookie);
  const tokenExpiresAt = accessToken ? estimateAdobeTokenExpiry(accessToken) : 0;
  const needJwtRefresh = !accessToken || !pasteHadUserJwt || tokenExpiresAt > 0 && tokenExpiresAt - Date.now() < JWT_REFRESH_SKEW_MS;
  if (needJwtRefresh && cookie) {
    try {
      const refreshed = await exchangeAdobeCookieForAccessToken(cookie, fetchImpl);
      if (isAdobeUserAccessToken(refreshed)) {
        accessToken = refreshed;
        opts.log?.info?.("ADOBE-FIREFLY", "IMS cookie exchange produced a user JWT");
      }
    } catch {
    }
  }
  const cookieBlob = cookie || extractAdobeCookieHeader(joined) || "";
  if (!accessToken) {
    try {
      accessToken = await resolveAdobeAccessToken(opts.credentials, fetchImpl);
    } catch (err) {
      if (!adobeFireflyBrowserEnabled()) throw err;
      opts.log?.info?.(
        "ADOBE-FIREFLY",
        "no user JWT from paste/cookie \u2014 will read it from the signed-in Chrome profile"
      );
    }
  }
  const cookieForSession = cookie || cookieBlob;
  const forterTs = extractAdobeForterTimestampMs(cookieForSession);
  const working = lastWorkingArpByFingerprint.get(fingerprint);
  const workingFresh = working && Date.now() - working.at < WORKING_ARP_STICKY_MS ? working.arp : "";
  let arpSessionId = "";
  if (!opts.forceRefresh && !opts.rotateArp && workingFresh) {
    arpSessionId = workingFresh;
  } else if (!opts.forceRefresh && !opts.rotateArp && cached?.arpSessionId) {
    arpSessionId = cached.arpSessionId;
  } else {
    arpSessionId = resolveAdobeArpSessionIdSmart(cookieForSession || joined, {
      rotate: Boolean(opts.rotateArp)
    });
  }
  let session = {
    accessToken,
    cookie: cookieForSession,
    arpSessionId: String(arpSessionId || ""),
    tokenExpiresAt: estimateAdobeTokenExpiry(accessToken || cached?.accessToken || ""),
    updatedAt: Date.now(),
    fingerprint,
    browserSessionKey,
    source: workingFresh ? "cache" : cached?.source || "paste"
  };
  if (!session.browserSessionKey) session.browserSessionKey = browserSessionKey;
  const jwtIsUser = isAdobeUserAccessToken(session.accessToken);
  const jwtNeedsBrowserRefresh = !jwtIsUser || session.tokenExpiresAt - Date.now() < JWT_REFRESH_SKEW_MS;
  const forterAgeMs = getAdobeForterAgeMs(session.cookie);
  const riskStale = !workingFresh && forterAgeMs > FORTER_PROACTIVE_WARM_MS;
  const shouldWarm = adobeFireflyBrowserEnabled() && opts.allowBrowserRefresh !== false && (opts.forceRefresh || opts.rotateArp || jwtNeedsBrowserRefresh || riskStale);
  const canWarm = true;
  if (shouldWarm && canWarm) {
    const key = fingerprint;
    let inflight = browserRefreshInFlight.get(key);
    if (!inflight) {
      inflight = refreshAdobeSessionViaBrowser(session, opts.log, {
        force: true,
        proveWithPing: Boolean(opts.forceRefresh)
      }).finally(() => {
        browserRefreshInFlight.delete(key);
      });
      browserRefreshInFlight.set(key, inflight);
    }
    const warmed = await inflight;
    if (warmed) {
      session = { ...warmed, fingerprint };
      opts.log?.info?.(
        "ADOBE-FIREFLY",
        `durable CDP session warm applied (reason=${opts.forceRefresh ? "force" : opts.rotateArp ? "rotate" : jwtNeedsBrowserRefresh ? "jwt-expiry" : "stale-forter"})`
      );
    }
  }
  if (!session.arpSessionId) {
    session.arpSessionId = resolveAdobeArpSessionIdSmart(session.cookie || joined);
  }
  if (workingFresh && !opts.forceRefresh && !opts.rotateArp) {
    const warmForterTs = extractAdobeForterTimestampMs(session.cookie);
    if (!(warmForterTs > forterTs)) {
      session.arpSessionId = workingFresh;
      session.source = "cache";
    }
  }
  if (!isAdobeUserAccessToken(session.accessToken)) {
    throw new AdobeFireflyError(
      'Adobe Firefly is not signed in. On Providers \u2192 Adobe Firefly \u2192 Add Account (OAuth) choose "Sign in with browser" (fresh login window) or "Paste JWT / Cookie". After browser sign-in the app stores JWT+Cookie and keeps the risk session fresh automatically.',
      401,
      "not_signed_in"
    );
  }
  if (session.tokenExpiresAt <= Date.now() + 3e4) {
    throw new AdobeFireflyError(
      "Adobe Firefly browser session expired and could not renew automatically. Re-open the Adobe Firefly account and sign in once so the durable browser profile can renew future JWTs.",
      401,
      "session_expired"
    );
  }
  const finalForterTs = extractAdobeForterTimestampMs(session.cookie);
  const finalForterAge = getAdobeForterAgeMs(session.cookie);
  const hasStickyWorking = Boolean(workingFresh) && Date.now() - (lastWorkingArpByFingerprint.get(fingerprint)?.at || 0) < WORKING_ARP_STICKY_MS;
  if (finalForterTs > 0 && Number.isFinite(finalForterAge) && finalForterAge > FORTER_STALE_MS && !hasStickyWorking && opts.allowBrowserRefresh !== false) {
    throw new AdobeFireflyError(
      "Adobe Firefly risk session expired (Forter/Arkose). Open Providers \u2192 Adobe Firefly \u2192 Add Account (OAuth) \u2192 Sign in with browser once. After sign-in the app stores a fresh JWT+Cookie and refreshes them automatically for later generates.",
      401,
      "risk_session_stale"
    );
  }
  session.fingerprint = fingerprint;
  session.browserSessionKey = session.browserSessionKey || browserSessionKey;
  sessionCache.set(fingerprint, session);
  saveDiskSession(session);
  if (session.source === "browser" || session.source === "rebuild") {
    void writeBackAdobeFireflyCredentials(session, opts.log);
  }
  return session;
}
async function rotateAdobeFireflySessionOnError(session, opts) {
  if (session.tokenExpiresAt <= 0) {
    session = {
      ...session,
      tokenExpiresAt: estimateAdobeTokenExpiry(session.accessToken)
    };
  }
  const prevArp = session.arpSessionId;
  const attempt = opts?.attempt ?? 1;
  const forterTs = extractAdobeForterTimestampMs(session.cookie);
  const forterAgeMs = forterTs > 0 ? Math.max(0, Date.now() - forterTs) : null;
  const forterKnownStale = forterAgeMs != null && forterAgeMs > FORTER_STALE_MS;
  if (attempt <= 2 && !forterKnownStale && !opts?.authFailure) {
    const same = {
      ...session,
      updatedAt: Date.now(),
      source: "cache"
    };
    sessionCache.set(session.fingerprint, same);
    saveDiskSession(same);
    opts?.log?.info?.(
      "ADOBE-FIREFLY",
      `408 recovery: reusing ARP (quiet period, attempt ${attempt}, forterAgeMs=${forterAgeMs ?? "unknown"})`
    );
    return same;
  }
  clearAdobeFireflyWorkingArp(session.fingerprint);
  noteAdobeFireflySubmitFailure();
  const tryBrowser = opts?.tryBrowser !== false && process.env.ADOBE_FIREFLY_BROWSER_REFRESH !== "0";
  if (tryBrowser) {
    opts?.log?.info?.(
      "ADOBE-FIREFLY",
      `${opts?.authFailure ? "auth" : "408"} recovery: durable CDP warm (attempt=${attempt}, forterKnownStale=${forterKnownStale}, forterAgeMs=${forterAgeMs ?? "unknown"})`
    );
    const warmed = await refreshAdobeSessionViaBrowser(session, opts?.log, {
      force: true,
      proveWithPing: true
    });
    if (warmed?.arpSessionId) {
      const next2 = { ...warmed, fingerprint: session.fingerprint };
      sessionCache.set(session.fingerprint, next2);
      saveDiskSession(next2);
      opts?.log?.info?.(
        "ADOBE-FIREFLY",
        `${opts?.authFailure ? "auth" : "408"} recovery: CDP warm done (arp changed=${warmed.arpSessionId !== prevArp}, forterTs=${extractAdobeForterTimestampMs(warmed.cookie)})`
      );
      return next2;
    }
  }
  const rebuilt = resolveAdobeArpSessionIdSmart(session.cookie, {
    rotate: true
  });
  const next = {
    ...session,
    arpSessionId: rebuilt && rebuilt !== prevArp ? rebuilt : session.arpSessionId,
    updatedAt: Date.now(),
    source: "rebuild"
  };
  sessionCache.set(session.fingerprint, next);
  saveDiskSession(next);
  return next;
}
function __resetAdobeFireflySessionCacheForTests() {
  sessionCache.clear();
  browserRefreshInFlight.clear();
  lastWorkingArpByFingerprint.clear();
  browserWarmFailureCooldown.clear();
  lastAdobeSubmitAt = 0;
  consecutiveAdobeSubmitSuccesses = 0;
  adobeSubmitChain = Promise.resolve();
}
export {
  __resetAdobeFireflySessionCacheForTests,
  adobeFireflyBrowserEnabled,
  buildAdobeArpSessionIdFromCookies,
  canRebuildAdobeArpFromCookies,
  clearAdobeFireflyWorkingArp,
  ensureAdobeFireflySession,
  estimateAdobeTokenExpiry,
  extractAdobeForterTimestampMs,
  fingerprintAdobeCredential,
  getAdobeCookieValue,
  getAdobeForterAgeMs,
  markAdobeFireflyArpSuccess,
  mergeAdobeCookieHeaders,
  normalizeAdobeForterToken,
  noteAdobeFireflySubmitFailure,
  refreshAdobeSessionViaBrowser,
  resolveAdobeArpSessionIdSmart,
  rotateAdobeFireflySessionOnError,
  serializeAdobeFireflyCredential,
  withAdobeFireflySubmitGate
};
