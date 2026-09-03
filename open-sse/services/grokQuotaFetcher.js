import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const DEFAULT_ISSUER = "https://auth.x.ai";
const FETCH_COOLDOWN_MS = 5 * 60 * 1e3;
const REQUEST_TIMEOUT_MS = 1e4;
const EXPIRY_SKEW_MS = 6e4;
function getAuthPath() {
  const override = (process.env.GROK_AUTH_PATH || "").trim();
  return override || join(homedir(), ".grok", "auth.json");
}
const GROK_WINDOW_WEEKLY = "weekly";
const quotaCache = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 6e4;
const _cacheCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of quotaCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS * 5) {
      quotaCache.delete(key);
    }
  }
}, 5 * 6e4);
if (typeof _cacheCleanup === "object" && "unref" in _cacheCleanup) {
  _cacheCleanup.unref?.();
}
function isAllowedXaiUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === "x.ai" || url.hostname.endsWith(".x.ai"));
  } catch {
    return false;
  }
}
async function readAuthFile() {
  if (!(await access(getAuthPath()).then(() => true).catch(() => false))) return null;
  try {
    const raw = JSON.parse(await readFile(getAuthPath(), "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}
function pickAuthEntry(file) {
  const now = Date.now();
  const scored = Object.entries(file).map(([entryId, e]) => {
    const token = typeof e?.key === "string" ? e.key.trim() : "";
    const exp = e?.expires_at ? Date.parse(e.expires_at) : Number.POSITIVE_INFINITY;
    const expired = Number.isFinite(exp) ? exp <= now + EXPIRY_SKEW_MS : false;
    const hasRefresh = typeof e?.refresh_token === "string" && e.refresh_token.length > 0;
    return { entryId, e, token, exp, expired, hasRefresh };
  }).filter((x) => x.token.length > 0 || x.hasRefresh);
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (a.expired !== b.expired) return a.expired ? 1 : -1;
    if (a.hasRefresh !== b.hasRefresh) return a.hasRefresh ? -1 : 1;
    return b.exp - a.exp;
  });
  const best = scored[0];
  const issuer = (best.e.oidc_issuer || DEFAULT_ISSUER).replace(/\/$/, "");
  return {
    entryId: best.entryId,
    token: best.token,
    refreshToken: best.e.refresh_token?.trim() || void 0,
    email: best.e.email,
    expiresAtMs: Number.isFinite(best.exp) ? best.exp : void 0,
    issuer,
    clientId: best.e.oidc_client_id?.trim() || void 0
  };
}
async function writeRefreshedTokens(entryId, update) {
  const file = await readAuthFile();
  if (!file || !file[entryId]) return;
  file[entryId] = {
    ...file[entryId],
    key: update.access,
    ...update.refresh ? { refresh_token: update.refresh } : {},
    expires_at: update.expiresAtIso
  };
  try {
    await writeFile(getAuthPath(), `${JSON.stringify(file, null, 2)}
`, { encoding: "utf8" });
  } catch {
  }
}
async function discoverTokenEndpoint(issuer, signal) {
  const discoveryUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  if (!isAllowedXaiUrl(discoveryUrl)) {
    throw new Error("invalid oidc issuer");
  }
  const res = await fetch(discoveryUrl, {
    headers: { Accept: "application/json" },
    signal
  });
  if (!res.ok) throw new Error(`token refresh failed (discovery HTTP ${res.status})`);
  const json = await res.json();
  const endpoint = String(json.token_endpoint || "");
  if (!isAllowedXaiUrl(endpoint)) throw new Error("invalid token endpoint");
  return endpoint;
}
async function refreshAccessToken(auth, signal) {
  if (!auth.refreshToken) {
    throw new Error("auth expired \u2014 run `grok login`");
  }
  if (!auth.clientId) {
    throw new Error("auth missing client id \u2014 run `grok login`");
  }
  const tokenEndpoint = await discoverTokenEndpoint(auth.issuer, signal);
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "omniroute-grok-usage/1.0"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: auth.clientId,
      refresh_token: auth.refreshToken
    }).toString(),
    signal
  });
  if (!res.ok) {
    throw new Error(`token refresh failed (HTTP ${res.status})`);
  }
  const payload = await res.json();
  const access = String(payload.access_token || "").trim();
  if (!access) throw new Error("token refresh failed (empty access token)");
  const expiresInSec = Number(payload.expires_in || 3600);
  const expiresAtMs = Date.now() + Math.max(60, expiresInSec) * 1e3;
  const expiresAtIso = new Date(expiresAtMs).toISOString();
  const refresh = String(payload.refresh_token || auth.refreshToken).trim();
  try {
    await writeRefreshedTokens(auth.entryId, {
      access,
      refresh,
      expiresAtIso
    });
  } catch {
  }
  return {
    ...auth,
    token: access,
    refreshToken: refresh,
    expiresAtMs
  };
}
function needsRefresh(auth) {
  if (!auth.token) return true;
  if (auth.expiresAtMs == null) return false;
  return auth.expiresAtMs <= Date.now() + EXPIRY_SKEW_MS;
}
async function resolveAuth(signal) {
  const file = await readAuthFile();
  if (!file) throw new Error("no grok auth \u2014 run `grok login`");
  const auth = pickAuthEntry(file);
  if (!auth) throw new Error("no usable Grok credentials \u2014 run `grok login`");
  if (needsRefresh(auth)) {
    return refreshAccessToken(auth, signal);
  }
  return auth;
}
function periodShort(type) {
  if (!type) return "";
  if (type.includes("WEEKLY")) return "weekly";
  if (type.includes("MONTHLY")) return "monthly";
  if (type.includes("DAILY")) return "daily";
  return "period";
}
function resetLocalLabel(endIso) {
  if (!endIso) return "";
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "";
  const weekday = end.toLocaleDateString(void 0, { weekday: "short" });
  const hour = end.toLocaleTimeString(void 0, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${weekday} ${hour.replace(/^24:/, "00:")}`;
}
async function fetchGrokBillingWithToken(token, signal) {
  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    return await fetchBilling(token, signal ?? controller.signal);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
function grokBillingSnapshotToQuotaInfo(snap) {
  return snapshotToQuotaInfo(snap);
}
async function fetchBilling(token, signal) {
  const res = await fetch(BILLING_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "omniroute-grok-usage/1.0",
      "x-grok-client-mode": "cli"
    },
    signal
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`auth ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const cfg = data.config ?? {};
  const percent = Number(cfg.creditUsagePercent ?? 0);
  const endIso = cfg.currentPeriod?.end ?? cfg.billingPeriodEnd;
  const products = (cfg.productUsage ?? []).filter((p) => p.product).map((p) => ({ product: String(p.product), usagePercent: p.usagePercent }));
  return {
    percent: Number.isFinite(percent) ? percent : 0,
    periodLabel: periodShort(cfg.currentPeriod?.type),
    resetLabel: resetLocalLabel(endIso),
    endIso,
    products,
    onDemandUsed: Number(cfg.onDemandUsed?.val ?? 0),
    onDemandCap: Number(cfg.onDemandCap?.val ?? 0),
    prepaidBalance: Number(cfg.prepaidBalance?.val ?? 0),
    fetchedAt: Date.now()
  };
}
function snapshotToQuotaInfo(snap) {
  const percentUsed = Math.max(0, Math.min(1, snap.percent / 100));
  return {
    used: Math.round(snap.percent),
    total: 100,
    percentUsed,
    resetAt: snap.endIso ?? null,
    windows: {
      [GROK_WINDOW_WEEKLY]: {
        percentUsed,
        resetAt: snap.endIso ?? null
      }
    }
  };
}
async function fetchGrokWebQuota(connectionId, _connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let auth;
      try {
        auth = await resolveAuth(controller.signal);
      } catch {
        quotaCache.set(connectionId, { quota: null, error: null, fetchedAt: Date.now() });
        return null;
      }
      try {
        const snap = await fetchBilling(auth.token, controller.signal);
        const quota = snapshotToQuotaInfo(snap);
        quotaCache.set(connectionId, { quota, error: null, fetchedAt: Date.now() });
        return quota;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.startsWith("auth ") && auth.refreshToken) {
          auth = await refreshAccessToken(auth, controller.signal);
          const snap = await fetchBilling(auth.token, controller.signal);
          const quota = snapshotToQuotaInfo(snap);
          quotaCache.set(connectionId, { quota, error: null, fetchedAt: Date.now() });
          return quota;
        }
        quotaCache.set(connectionId, { quota: null, error: msg, fetchedAt: Date.now() });
        return null;
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    quotaCache.set(connectionId, { quota: null, error: null, fetchedAt: Date.now() });
    return null;
  }
}
function invalidateGrokWebQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerGrokWebQuotaFetcher() {
  registerQuotaFetcher("grok-web", fetchGrokWebQuota);
  registerMonitorFetcher("grok-web", fetchGrokWebQuota);
  registerQuotaWindows("grok-web", [GROK_WINDOW_WEEKLY]);
}
export {
  GROK_WINDOW_WEEKLY,
  fetchGrokBillingWithToken,
  fetchGrokWebQuota,
  grokBillingSnapshotToQuotaInfo,
  invalidateGrokWebQuotaCache,
  registerGrokWebQuotaFetcher
};
