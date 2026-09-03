import {
  fetchGrokBillingWithToken,
  grokBillingSnapshotToQuotaInfo,
  GROK_WINDOW_WEEKLY
} from "./grokQuotaFetcher.js";
import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const CACHE_TTL_MS = 6e4;
const REQUEST_TIMEOUT_MS = 1e4;
const XAI_OAUTH_PROVIDER_IDS = ["xai-oauth", "xao"];
const quotaCache = /* @__PURE__ */ new Map();
const _cacheCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of quotaCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS * 5) {
      quotaCache.delete(key);
    }
  }
}, 5 * 6e4);
if (typeof _cacheCleanup === "object" && _cacheCleanup && "unref" in _cacheCleanup) {
  _cacheCleanup.unref?.();
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function extractXaiOauthAccessToken(connection) {
  if (typeof connection?.accessToken === "string" && connection.accessToken.trim()) {
    return connection.accessToken.trim();
  }
  const credentials = toRecord(connection?.credentials);
  if (typeof credentials.accessToken === "string" && credentials.accessToken.trim()) {
    return credentials.accessToken.trim();
  }
  return null;
}
async function fetchXaiOauthQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const accessToken = extractXaiOauthAccessToken(connection);
  if (!accessToken) {
    quotaCache.set(connectionId, { quota: null, fetchedAt: Date.now() });
    return null;
  }
  try {
    await throttleQuotaFetch();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const snap = await fetchGrokBillingWithToken(accessToken, controller.signal);
      const quota = grokBillingSnapshotToQuotaInfo(snap);
      quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
      return quota;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    quotaCache.set(connectionId, { quota: null, fetchedAt: Date.now() });
    return null;
  }
}
function invalidateXaiOauthQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerXaiOauthQuotaFetcher() {
  for (const provider of XAI_OAUTH_PROVIDER_IDS) {
    registerQuotaFetcher(provider, fetchXaiOauthQuota);
    registerMonitorFetcher(provider, fetchXaiOauthQuota);
    registerQuotaWindows(provider, [GROK_WINDOW_WEEKLY]);
  }
}
export {
  extractXaiOauthAccessToken,
  fetchXaiOauthQuota,
  invalidateXaiOauthQuotaCache,
  registerXaiOauthQuotaFetcher
};
