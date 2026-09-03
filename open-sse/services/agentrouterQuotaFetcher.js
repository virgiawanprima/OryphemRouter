import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const AGENTROUTER_CONFIG = {
  baseUrl: "https://agentrouter.org",
  selfPath: "/api/user/self"
};
const QUOTA_PER_UNIT = 5e5;
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
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function extractCredentials(connection) {
  const providerSpecificData = toRecord(connection?.providerSpecificData);
  const systemAccessToken = typeof providerSpecificData.consoleApiKey === "string" && providerSpecificData.consoleApiKey.trim().length > 0 ? providerSpecificData.consoleApiKey : null;
  const userId = typeof providerSpecificData.newApiUserId === "string" && providerSpecificData.newApiUserId.trim().length > 0 ? providerSpecificData.newApiUserId : null;
  return { systemAccessToken, userId };
}
function parseAgentrouterQuotaResponse(data) {
  const obj = toRecord(data);
  const dataObj = toRecord(obj.data);
  const rawQuotaValue = "quota" in dataObj ? dataObj.quota : obj.quota;
  if (rawQuotaValue === void 0) return null;
  const rawQuota = toNumber(rawQuotaValue, -1);
  if (rawQuota < 0) return null;
  const dollarBalance = rawQuota / QUOTA_PER_UNIT;
  const limitReached = rawQuota <= 0;
  const percentUsed = limitReached ? 1 : 0;
  return {
    used: percentUsed * 100,
    total: 100,
    percentUsed,
    resetAt: null,
    rawQuota,
    dollarBalance,
    limitReached
  };
}
async function fetchAgentrouterQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const { systemAccessToken, userId } = extractCredentials(connection);
  if (!systemAccessToken || !userId) {
    return null;
  }
  const url = `${AGENTROUTER_CONFIG.baseUrl}${AGENTROUTER_CONFIG.selfPath}`;
  try {
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${systemAccessToken}`,
        "New-Api-User": userId,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8e3)
    });
    if (response.status === 401 || response.status === 403) {
      quotaCache.delete(connectionId);
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const quota = parseAgentrouterQuotaResponse(data);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateAgentrouterQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerAgentrouterQuotaFetcher() {
  registerQuotaFetcher("agentrouter", fetchAgentrouterQuota);
  registerMonitorFetcher("agentrouter", fetchAgentrouterQuota);
}
export {
  fetchAgentrouterQuota,
  invalidateAgentrouterQuotaCache,
  registerAgentrouterQuotaFetcher
};
