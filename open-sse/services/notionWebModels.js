import {
  NOTION_WEB_FALLBACK_MODELS
} from "./notionWebFallbackModels.js";
const NOTION_APP_ORIGIN = "https://app.notion.com";
const NOTION_LEGACY_ORIGIN = "https://www.notion.so";
const NOTION_MODELS_URL = `${NOTION_APP_ORIGIN}/api/v3/getAvailableModels`;
const NOTION_SPACES_URL = `${NOTION_APP_ORIGIN}/api/v3/getSpaces`;
const NOTION_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const NOTION_CLIENT_VERSION = "23.13.20260719.1125";
const NOTION_MAX_SPACE_PROBE = 8;
const NOTION_SPACE_CACHE = /* @__PURE__ */ new Map();
const NOTION_SPACE_CACHE_TTL_MS = 30 * 60 * 1e3;
const BROWSER_HEADERS = {
  "sec-ch-ua": '"Chromium";v="149", "Not)A;Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  priority: "u=1, i",
  "cache-control": "no-cache",
  pragma: "no-cache"
};
function notionTokenCacheKey(cookie) {
  return readCookieValue(cookie, "token_v2") || normalizeNotionWebCookie(cookie);
}
function normalizeNotionWebCookie(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed.includes("=") ? trimmed : `token_v2=${trimmed}`;
}
function readCookieValue(cookie, name) {
  if (!cookie || !name) return "";
  const re = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`, "i");
  const m = cookie.match(re);
  if (!m) return "";
  const raw = m[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
function extractSpaceIdFromNotionCookie(cookie) {
  return readCookieValue(cookie, "space_id") || readCookieValue(cookie, "spaceId") || "";
}
function extractNotionUserIdFromCookie(cookie) {
  return readCookieValue(cookie, "notion_user_id") || readCookieValue(cookie, "notion_user_id_v2") || readCookieValue(cookie, "user_id") || "";
}
function trimmedOrFallback(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function rowSupportsReasoning(row) {
  const efforts = row.modelConfiguration?.supportedReasoningEfforts;
  return Array.isArray(efforts) && efforts.length > 0;
}
function slugifyNotionDisplayName(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "");
}
function catalogIdForNotionModel(codename, displayName) {
  const slug = slugifyNotionDisplayName(displayName);
  if (slug && slug !== "notion-ai") return slug;
  return codename;
}
function listNotionDisabledModels(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const list = data.models;
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry;
    if (row.isDisabled !== true) continue;
    const codename = typeof row.model === "string" ? row.model.trim() : "";
    if (!codename || seen.has(codename)) continue;
    seen.add(codename);
    const name = trimmedOrFallback(row.modelMessage, codename);
    const reason = typeof row.disabledReason === "string" && row.disabledReason.trim() ? row.disabledReason.trim() : "disabled";
    out.push({
      id: catalogIdForNotionModel(codename, name),
      name,
      notionCodename: codename,
      reason
    });
  }
  return out;
}
function formatNotionDisabledModelsWarning(disabled) {
  if (!disabled.length) return "";
  const parts = disabled.map((d) => {
    const reason = d.reason.replace(/_/g, " ");
    return `${d.name} (${reason})`;
  });
  return `Notion hid ${disabled.length} model(s) as unavailable for this account/workspace: ${parts.join("; ")}. They appear in the web picker only when your plan unlocks them (e.g. Fable 5 requires a Notion Business or Enterprise plan).`;
}
function parseNotionModelEntry(entry, seen) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const row = entry;
  if (row.isDisabled === true) return null;
  const codename = typeof row.model === "string" ? row.model.trim() : "";
  if (!codename) return null;
  const name = trimmedOrFallback(row.modelMessage, codename);
  const catalogId = catalogIdForNotionModel(codename, name);
  if (seen.has(catalogId) || seen.has(codename)) return null;
  seen.add(catalogId);
  seen.add(codename);
  return {
    id: catalogId,
    name,
    owned_by: trimmedOrFallback(row.modelFamily, "notion"),
    ...catalogId !== codename ? { notionCodename: codename } : {},
    ...rowSupportsReasoning(row) ? { supportsReasoning: true } : {}
  };
}
function withFriendlyNotionAliases(models) {
  return models;
}
function withDefaultNotionModel(out, seen) {
  if (out.length === 0 || seen.has("notion-ai")) return out;
  return [{ id: "notion-ai", name: "Notion AI (default)", owned_by: "notion" }, ...out];
}
function parseNotionAvailableModels(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const list = data.models;
  if (!Array.isArray(list)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of list) {
    const model = parseNotionModelEntry(entry, seen);
    if (model) out.push(model);
  }
  return withFriendlyNotionAliases(withDefaultNotionModel(out, seen));
}
function buildNotionModelsDiscoveryHeaders(token) {
  const cookie = normalizeNotionWebCookie(token);
  const spaceId = extractSpaceIdFromNotionCookie(cookie);
  const userId = extractNotionUserIdFromCookie(cookie);
  const headers = {
    accept: "*/*",
    "content-type": "application/json",
    "user-agent": NOTION_USER_AGENT,
    origin: NOTION_APP_ORIGIN,
    referer: `${NOTION_APP_ORIGIN}/ai`,
    "notion-client-version": NOTION_CLIENT_VERSION,
    "notion-audit-log-platform": "web",
    ...cookie ? { cookie } : {},
    ...BROWSER_HEADERS
  };
  if (spaceId) headers["x-notion-space-id"] = spaceId;
  if (userId) headers["x-notion-active-user-header"] = userId;
  return headers;
}
function buildNotionModelsDiscoveryBody(token) {
  const cookie = normalizeNotionWebCookie(token);
  const spaceId = extractSpaceIdFromNotionCookie(cookie);
  return spaceId ? { spaceId } : {};
}
function getNotionModelsDiscoveryUrl() {
  return NOTION_MODELS_URL;
}
function collectUserSpaceEntry(key, value, spaceIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const spaceMap = value.space;
  if (!spaceMap || typeof spaceMap !== "object" || Array.isArray(spaceMap)) return "";
  for (const id of Object.keys(spaceMap)) {
    if (id && !spaceIds.includes(id)) spaceIds.push(id);
  }
  return key && !key.includes(" ") ? key : "";
}
function collectFallbackSpaceIds(root, spaceIds) {
  const fromArray = pickSpaceIdFromSpacesArray(root.spaces);
  if (fromArray) spaceIds.push(fromArray);
  const fromIds = pickSpaceIdFromSpaceIdsArray(root.spaceIds);
  if (fromIds && !spaceIds.includes(fromIds)) spaceIds.push(fromIds);
}
function parseNotionGetSpaces(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { userId: "", spaceIds: [] };
  }
  const root = data;
  const spaceIds = [];
  let userId = "";
  for (const [key, value] of Object.entries(root)) {
    const entryUserId = collectUserSpaceEntry(key, value, spaceIds);
    if (!userId && entryUserId) userId = entryUserId;
  }
  if (spaceIds.length === 0) {
    collectFallbackSpaceIds(root, spaceIds);
  }
  return { userId, spaceIds };
}
function pickSpaceIdFromUserMap(root) {
  return parseNotionGetSpaces(root).spaceIds[0] || "";
}
function pickSpaceIdFromSpacesArray(spaces) {
  if (!Array.isArray(spaces)) return "";
  for (const s of spaces) {
    if (s && typeof s === "object" && typeof s.id === "string") {
      return s.id;
    }
  }
  return "";
}
function pickSpaceIdFromSpaceIdsArray(spaceIds) {
  return Array.isArray(spaceIds) && typeof spaceIds[0] === "string" ? spaceIds[0] : "";
}
function pickFirstSpaceId(data) {
  return parseNotionGetSpaces(data).spaceIds[0] || "";
}
function buildNotionBrowserHeaders(cookie, userId) {
  const headers = {
    accept: "*/*",
    "content-type": "application/json",
    "user-agent": NOTION_USER_AGENT,
    origin: NOTION_APP_ORIGIN,
    referer: `${NOTION_APP_ORIGIN}/ai`,
    "notion-client-version": NOTION_CLIENT_VERSION,
    "notion-audit-log-platform": "web",
    cookie,
    ...BROWSER_HEADERS
  };
  if (userId) headers["x-notion-active-user-header"] = userId;
  return headers;
}
async function fetchNotionWorkspaceCandidates(cookie, fetchImpl = fetch) {
  const normalized = normalizeNotionWebCookie(cookie);
  if (!normalized) return { userId: "", spaceIds: [] };
  const userFromCookie = extractNotionUserIdFromCookie(normalized);
  try {
    const res = await fetchImpl(NOTION_SPACES_URL, {
      method: "POST",
      headers: buildNotionBrowserHeaders(normalized, userFromCookie || void 0),
      body: "{}"
    });
    if (!res.ok) return { userId: userFromCookie, spaceIds: [] };
    const data = await res.json();
    const parsed = parseNotionGetSpaces(data);
    return {
      userId: userFromCookie || parsed.userId,
      spaceIds: parsed.spaceIds
    };
  } catch {
    return { userId: userFromCookie, spaceIds: [] };
  }
}
async function resolveNotionSpaceIdFromGetSpaces(cookie, fetchImpl = fetch) {
  const { spaceIds } = await fetchNotionWorkspaceCandidates(cookie, fetchImpl);
  return spaceIds[0] || "";
}
async function selectBestNotionSpaceId(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cookie = normalizeNotionWebCookie(opts.cookie);
  if (!cookie || opts.spaceIds.length === 0) return null;
  let best = null;
  for (const spaceId of opts.spaceIds.slice(0, NOTION_MAX_SPACE_PROBE)) {
    if (!spaceId) continue;
    try {
      const headers = buildNotionBrowserHeaders(cookie, opts.userId || void 0);
      headers["x-notion-space-id"] = spaceId;
      const res = await fetchImpl(NOTION_MODELS_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ spaceId }),
        signal: opts.signal ?? void 0
      });
      if (!res.ok) continue;
      const raw = await res.json();
      const models = parseNotionAvailableModels(raw);
      const enabled = models.filter((m) => m.id !== "notion-ai").length;
      const disabled = listNotionDisabledModels(raw);
      const fableLocked = disabled.some(
        (d) => d.id === "fable-5" || d.notionCodename === "acai-budino-high"
      );
      const fableEnabled = models.some(
        (m) => m.id === "fable-5" || m.notionCodename === "acai-budino-high"
      );
      let score = enabled * 10;
      if (fableEnabled) score += 1e3;
      else if (fableLocked) score -= 50;
      if (!best || score > best.score) {
        best = { spaceId, models, raw, score };
      }
    } catch {
    }
  }
  return best ? { spaceId: best.spaceId, models: best.models, raw: best.raw } : null;
}
async function resolveNotionRuntimeWorkspace(opts) {
  const cookie = normalizeNotionWebCookie(opts.cookie);
  const explicit = extractSpaceIdFromNotionCookie(cookie);
  const userId = extractNotionUserIdFromCookie(cookie);
  if (explicit) {
    return { spaceId: explicit, userId, fromCache: false };
  }
  const key = notionTokenCacheKey(cookie);
  const cached = NOTION_SPACE_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { spaceId: cached.spaceId, userId: cached.userId || userId, fromCache: true };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const candidates = await fetchNotionWorkspaceCandidates(cookie, fetchImpl);
  const best = await selectBestNotionSpaceId({
    cookie,
    spaceIds: candidates.spaceIds,
    userId: userId || candidates.userId || void 0,
    fetchImpl,
    signal: opts.signal
  });
  if (!best?.spaceId) {
    return {
      spaceId: candidates.spaceIds[0] || "",
      userId: userId || candidates.userId,
      fromCache: false
    };
  }
  const resolvedUser = userId || candidates.userId;
  NOTION_SPACE_CACHE.set(key, {
    spaceId: best.spaceId,
    userId: resolvedUser,
    expiresAt: Date.now() + NOTION_SPACE_CACHE_TTL_MS
  });
  return { spaceId: best.spaceId, userId: resolvedUser, fromCache: false };
}
async function discoverNotionModelsForExplicitSpace(opts) {
  const headers = buildNotionModelsDiscoveryHeaders(opts.cookie);
  headers["x-notion-space-id"] = opts.spaceId;
  if (opts.userId) headers["x-notion-active-user-header"] = opts.userId;
  const res = await opts.fetchImpl(NOTION_MODELS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ spaceId: opts.spaceId }),
    signal: opts.signal ?? void 0
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getAvailableModels failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    spaceId: opts.spaceId,
    models: parseNotionAvailableModels(data),
    data,
    spaceIdFromGetSpaces: false
  };
}
async function discoverNotionModelsViaGetSpaces(opts) {
  const candidates = await fetchNotionWorkspaceCandidates(opts.cookie, opts.fetchImpl);
  const userId = opts.userId || candidates.userId;
  if (candidates.spaceIds.length === 0) {
    throw new Error(
      "Could not resolve a Notion workspace from token_v2 alone. Re-copy a fresh token_v2 from app.notion.com (Application \u2192 Cookies), or optionally paste space_id from Network \u2192 getAvailableModels \u2192 x-notion-space-id."
    );
  }
  const best = await selectBestNotionSpaceId({
    cookie: opts.cookie,
    spaceIds: candidates.spaceIds,
    userId: userId || void 0,
    fetchImpl: opts.fetchImpl,
    signal: opts.signal
  });
  if (!best || best.models.length === 0) {
    throw new Error(
      "getAvailableModels returned no enabled models for any workspace visible to this token"
    );
  }
  const key = notionTokenCacheKey(opts.cookie);
  NOTION_SPACE_CACHE.set(key, {
    spaceId: best.spaceId,
    userId: userId || "",
    expiresAt: Date.now() + NOTION_SPACE_CACHE_TTL_MS
  });
  return { spaceId: best.spaceId, models: best.models, data: best.raw, spaceIdFromGetSpaces: true };
}
async function discoverNotionWebModels(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cookie = normalizeNotionWebCookie(opts.token);
  if (!cookie) {
    throw new Error("Missing Notion token_v2 cookie");
  }
  const spaceIdFromCookie = extractSpaceIdFromNotionCookie(cookie);
  const userId = extractNotionUserIdFromCookie(cookie);
  const result = spaceIdFromCookie ? await discoverNotionModelsForExplicitSpace({
    cookie,
    spaceId: spaceIdFromCookie,
    userId,
    fetchImpl,
    signal: opts.signal
  }) : await discoverNotionModelsViaGetSpaces({ cookie, userId, fetchImpl, signal: opts.signal });
  if (result.models.length === 0) {
    throw new Error("getAvailableModels returned no enabled models");
  }
  const disabledModels = listNotionDisabledModels(result.data);
  const warnings = [];
  const disabledWarning = formatNotionDisabledModelsWarning(disabledModels);
  if (disabledWarning) warnings.push(disabledWarning);
  return {
    models: result.models,
    spaceId: result.spaceId,
    source: "api",
    disabledModels,
    spaceIdFromGetSpaces: result.spaceIdFromGetSpaces,
    ...warnings.length ? { warning: warnings.join(" ") } : {}
  };
}
function notionCodenameOf(model) {
  if (!model?.id || model.id === "notion-ai") return "";
  return (model.notionCodename || model.id).trim();
}
function buildNotionFriendlyToCodenameMap(models = NOTION_WEB_FALLBACK_MODELS) {
  const map = /* @__PURE__ */ new Map();
  for (const m of models) {
    if (!m?.id || m.id === "notion-ai") continue;
    const codename = notionCodenameOf(m);
    if (!codename) continue;
    map.set(m.id, codename);
    map.set(m.id.toLowerCase(), codename);
    map.set(codename, codename);
    map.set(codename.toLowerCase(), codename);
    if (m.name) {
      map.set(m.name.toLowerCase(), codename);
      const slug = slugifyNotionDisplayName(m.name);
      if (slug) map.set(slug, codename);
    }
  }
  return map;
}
function resolveNotionCodename(model, extraModels = []) {
  let m = typeof model === "string" ? model.trim() : "";
  if (!m || m === "notion-ai") return "";
  if (m.startsWith("notion-web/")) m = m.slice("notion-web/".length);
  else if (m.startsWith("nw/")) m = m.slice(3);
  if (!m || m === "notion-ai") return "";
  const map = buildNotionFriendlyToCodenameMap([...NOTION_WEB_FALLBACK_MODELS, ...extraModels]);
  return map.get(m) || map.get(m.toLowerCase()) || map.get(slugifyNotionDisplayName(m)) || m;
}
export {
  BROWSER_HEADERS,
  NOTION_APP_ORIGIN,
  NOTION_CLIENT_VERSION,
  NOTION_LEGACY_ORIGIN,
  NOTION_MODELS_URL,
  NOTION_SPACES_URL,
  NOTION_WEB_FALLBACK_MODELS,
  buildNotionFriendlyToCodenameMap,
  buildNotionModelsDiscoveryBody,
  buildNotionModelsDiscoveryHeaders,
  catalogIdForNotionModel,
  discoverNotionWebModels,
  extractNotionUserIdFromCookie,
  extractSpaceIdFromNotionCookie,
  fetchNotionWorkspaceCandidates,
  formatNotionDisabledModelsWarning,
  getNotionModelsDiscoveryUrl,
  listNotionDisabledModels,
  normalizeNotionWebCookie,
  notionCodenameOf,
  parseNotionAvailableModels,
  parseNotionGetSpaces,
  pickFirstSpaceId,
  readCookieValue,
  resolveNotionCodename,
  resolveNotionRuntimeWorkspace,
  resolveNotionSpaceIdFromGetSpaces,
  selectBestNotionSpaceId,
  slugifyNotionDisplayName,
  withFriendlyNotionAliases
};
