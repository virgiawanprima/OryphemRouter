import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const BAILIAN_QUOTA_HOSTS = {
  international: "https://modelstudio.console.alibabacloud.com",
  china: "https://bailian.console.aliyun.com"
};
const BAILIAN_QUOTA_PATH = "/data/api.json?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2";
const CACHE_TTL_MS = 6e4;
const BAILIAN_WINDOW_5H = "window_5h";
const BAILIAN_WINDOW_WEEKLY = "window_weekly";
const BAILIAN_WINDOW_MONTHLY = "window_monthly";
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
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function getAuthKey(providerSpecificData, apiKey) {
  const consoleKey = providerSpecificData?.consoleApiKey;
  if (typeof consoleKey === "string" && consoleKey.trim().length > 0) {
    return consoleKey;
  }
  return apiKey;
}
function getHost() {
  const configuredHost = process.env.ALIBABA_CODING_PLAN_HOST?.trim();
  if (!configuredHost) {
    return BAILIAN_QUOTA_HOSTS.international;
  }
  if (/^https?:\/\//i.test(configuredHost)) {
    return configuredHost;
  }
  return `https://${configuredHost}`;
}
function getQuotaUrl() {
  return process.env.ALIBABA_CODING_PLAN_QUOTA_URL || `${getHost()}${BAILIAN_QUOTA_PATH}`;
}
function buildHeaders(authKey) {
  return {
    Authorization: `Bearer ${authKey}`,
    "x-api-key": authKey,
    "X-DashScope-API-Key": authKey,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}
function parseBailianQuotaResponse(data) {
  const obj = toRecord(data);
  if (obj["code"] === "ConsoleNeedLogin") {
    return null;
  }
  if (obj["code"] !== "Success" && obj["code"] !== "200") {
    return null;
  }
  const dataObj = toRecord(obj["data"]);
  const instanceInfos = dataObj["codingPlanInstanceInfos"];
  if (!Array.isArray(instanceInfos) || instanceInfos.length === 0) {
    return null;
  }
  const instance = toRecord(instanceInfos[0]);
  const quotaInfo = toRecord(instance["codingPlanQuotaInfo"]);
  if (Object.keys(quotaInfo).length === 0) {
    return null;
  }
  const used5h = toNumber(quotaInfo["per5HourUsedQuota"]);
  const total5h = toNumber(quotaInfo["per5HourTotalQuota"]);
  const resetAt5h = toNumber(quotaInfo["per5HourQuotaNextRefreshTime"]);
  const pct5h = total5h > 0 ? used5h / total5h : 0;
  const usedWeekly = toNumber(quotaInfo["perWeekUsedQuota"]);
  const totalWeekly = toNumber(quotaInfo["perWeekTotalQuota"]);
  const resetAtWeekly = toNumber(quotaInfo["perWeekQuotaNextRefreshTime"]);
  const pctWeekly = totalWeekly > 0 ? usedWeekly / totalWeekly : 0;
  const usedMonthly = toNumber(quotaInfo["perBillMonthUsedQuota"]);
  const totalMonthly = toNumber(quotaInfo["perBillMonthTotalQuota"]);
  const resetAtMonthly = toNumber(quotaInfo["perBillMonthQuotaNextRefreshTime"]);
  const pctMonthly = totalMonthly > 0 ? usedMonthly / totalMonthly : 0;
  const worstPercentUsed = Math.max(pct5h, pctWeekly, pctMonthly);
  const window5h = {
    percentUsed: pct5h,
    resetAt: resetAt5h > 0 ? new Date(resetAt5h * 1e3).toISOString() : null
  };
  const windowWeekly = {
    percentUsed: pctWeekly,
    resetAt: resetAtWeekly > 0 ? new Date(resetAtWeekly * 1e3).toISOString() : null
  };
  const windowMonthly = {
    percentUsed: pctMonthly,
    resetAt: resetAtMonthly > 0 ? new Date(resetAtMonthly * 1e3).toISOString() : null
  };
  const windows = {
    [BAILIAN_WINDOW_5H]: window5h,
    [BAILIAN_WINDOW_WEEKLY]: windowWeekly,
    [BAILIAN_WINDOW_MONTHLY]: windowMonthly
  };
  const dominantResetAt = worstPercentUsed === pct5h ? window5h.resetAt : worstPercentUsed === pctWeekly ? windowWeekly.resetAt : windowMonthly.resetAt;
  return {
    used: Math.round(worstPercentUsed * 100),
    total: 100,
    percentUsed: worstPercentUsed,
    resetAt: dominantResetAt,
    windows,
    window5h,
    windowWeekly,
    windowMonthly
  };
}
async function fetchBailianQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const providerSpecificData = connection?.providerSpecificData && typeof connection.providerSpecificData === "object" && !Array.isArray(connection.providerSpecificData) ? connection.providerSpecificData : void 0;
  const apiKey = typeof connection?.apiKey === "string" && connection.apiKey.trim().length > 0 ? connection.apiKey : "";
  const authKey = getAuthKey(providerSpecificData, apiKey);
  if (!authKey) {
    return null;
  }
  const headers = buildHeaders(authKey);
  try {
    const url = getQuotaUrl();
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8e3)
    });
    const rawData = await response.json();
    const obj = toRecord(rawData);
    if (obj["code"] === "ConsoleNeedLogin") {
      try {
        const chinaUrl = process.env.ALIBABA_CODING_PLAN_QUOTA_URL ? url : `${BAILIAN_QUOTA_HOSTS.china}${BAILIAN_QUOTA_PATH}`;
        await throttleQuotaFetch();
        const retryResponse = await fetch(chinaUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(8e3)
        });
        const retryData = await retryResponse.json();
        const quota2 = parseBailianQuotaResponse(retryData);
        if (quota2) {
          quotaCache.set(connectionId, { quota: quota2, fetchedAt: Date.now() });
          return quota2;
        }
        return null;
      } catch {
        return null;
      }
    }
    const quota = parseBailianQuotaResponse(rawData);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateBailianQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerBailianCodingPlanQuotaFetcher() {
  registerQuotaFetcher("bailian-coding-plan", fetchBailianQuota);
  registerMonitorFetcher("bailian-coding-plan", fetchBailianQuota);
  registerQuotaWindows("bailian-coding-plan", [
    BAILIAN_WINDOW_5H,
    BAILIAN_WINDOW_WEEKLY,
    BAILIAN_WINDOW_MONTHLY
  ]);
}
export {
  BAILIAN_WINDOW_5H,
  BAILIAN_WINDOW_MONTHLY,
  BAILIAN_WINDOW_WEEKLY,
  fetchBailianQuota,
  invalidateBailianQuotaCache,
  registerBailianCodingPlanQuotaFetcher
};
