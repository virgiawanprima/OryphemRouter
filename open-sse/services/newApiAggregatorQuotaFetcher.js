import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
import { toNumber } from "../utils/omni/numeric.js";
const SELF_PATH = "/api/user/self";
const DEFAULT_QUOTA_PER_UNIT = 5e5;
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
function stripV1Suffix(baseUrl) {
  return baseUrl.replace(/\/v1\/?$/, "");
}
function extractCredentials(connection) {
  const providerSpecificData = toRecord(connection?.providerSpecificData);
  const systemAccessToken = typeof providerSpecificData.consoleApiKey === "string" && providerSpecificData.consoleApiKey.trim().length > 0 ? providerSpecificData.consoleApiKey : null;
  const userId = typeof providerSpecificData.newApiUserId === "string" && providerSpecificData.newApiUserId.trim().length > 0 ? providerSpecificData.newApiUserId : null;
  const rawBaseUrl = typeof providerSpecificData.baseUrl === "string" && providerSpecificData.baseUrl.trim().length > 0 ? providerSpecificData.baseUrl.trim() : null;
  const baseUrl = rawBaseUrl ? stripV1Suffix(rawBaseUrl) : null;
  const rawQuotaPerUnit = toNumber(providerSpecificData.quotaPerUnit, 0);
  const quotaPerUnit = rawQuotaPerUnit > 0 ? rawQuotaPerUnit : DEFAULT_QUOTA_PER_UNIT;
  const aggregatorFlag = providerSpecificData.newApiAggregatorBalance === true;
  return { systemAccessToken, userId, baseUrl, quotaPerUnit, aggregatorFlag };
}
function parseNewApiAggregatorQuotaResponse(data, quotaPerUnit) {
  const obj = toRecord(data);
  const dataObj = toRecord(obj.data);
  const rawQuotaValue = "quota" in dataObj ? dataObj.quota : obj.quota;
  if (rawQuotaValue === void 0) return null;
  const rawQuota = toNumber(rawQuotaValue, -1);
  if (rawQuota < 0) return null;
  const dollarBalance = rawQuota / quotaPerUnit;
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
async function fetchNewApiAggregatorQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const { systemAccessToken, userId, baseUrl, quotaPerUnit, aggregatorFlag } = extractCredentials(connection);
  if (!aggregatorFlag) return null;
  if (!systemAccessToken || !userId || !baseUrl) return null;
  const url = `${baseUrl}${SELF_PATH}`;
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
    const quota = parseNewApiAggregatorQuotaResponse(data, quotaPerUnit);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateNewApiAggregatorQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function isNewApiAggregatorBalanceConnection(connection) {
  const providerSpecificData = toRecord(connection?.providerSpecificData);
  return providerSpecificData.newApiAggregatorBalance === true;
}
export {
  fetchNewApiAggregatorQuota,
  invalidateNewApiAggregatorQuotaCache,
  isNewApiAggregatorBalanceConnection
};
