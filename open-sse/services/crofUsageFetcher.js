import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const CROF_USAGE_URL = "https://crof.ai/usage_api/";
const CACHE_TTL_MS = 6e4;
const quotaCache = /* @__PURE__ */ new Map();
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
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function getApiKey(connection) {
  const raw = connection?.apiKey;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return null;
}
function parseCrofUsageResponse(data) {
  const obj = toRecord(data);
  if (Object.keys(obj).length === 0) return null;
  const usableRequestsRaw = obj["usable_requests"];
  const usableRequests = usableRequestsRaw === null || usableRequestsRaw === void 0 ? null : toNumber(usableRequestsRaw);
  const credits = toNumber(obj["credits"]) ?? 0;
  let percentUsed = 0;
  if (usableRequests !== null) {
    percentUsed = usableRequests > 0 ? 0 : 1;
  } else {
    percentUsed = credits > 0 ? 0 : 1;
  }
  return {
    used: 0,
    total: usableRequests ?? 0,
    percentUsed,
    resetAt: null,
    usableRequests,
    credits
  };
}
async function fetchCrofUsage(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const apiKey = getApiKey(connection);
  if (!apiKey) {
    return null;
  }
  try {
    await throttleQuotaFetch();
    const response = await fetch(CROF_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        quotaCache.delete(connectionId);
      }
      return null;
    }
    const data = await response.json();
    const quota = parseCrofUsageResponse(data);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateCrofUsageCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerCrofUsageFetcher() {
  registerQuotaFetcher("crof", fetchCrofUsage);
  registerMonitorFetcher("crof", fetchCrofUsage);
}
export {
  fetchCrofUsage,
  invalidateCrofUsageCache,
  parseCrofUsageResponse,
  registerCrofUsageFetcher
};
