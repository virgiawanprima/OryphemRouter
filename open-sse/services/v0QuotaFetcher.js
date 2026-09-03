import { registerQuotaFetcher, registerQuotaWindows } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const V0_CONFIG = {
  baseUrl: "https://api.v0.dev",
  billingPath: "/v1/user/billing",
  rateLimitsPath: "/v1/rate-limits"
};
const V0_WINDOW_CREDITS = "credits";
const V0_WINDOW_DAILY_OPS = "dailyOps";
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
function toIsoOrNull(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  return null;
}
function parseWindow(data) {
  const obj = toRecord(data);
  if (!("remaining" in obj) || !("limit" in obj)) return null;
  const remaining = toNumber(obj.remaining, -1);
  const limit = toNumber(obj.limit, -1);
  if (remaining < 0 || limit <= 0) return null;
  const used = Math.max(0, limit - remaining);
  const percentUsed = Math.min(1, used / limit);
  return { percentUsed, resetAt: toIsoOrNull(obj.reset) };
}
async function fetchWindow(url, headers, parse) {
  try {
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8e3)
    });
    if (response.status === 401 || response.status === 403) {
      return { window: null, billingType: null, invalidCredential: true };
    }
    if (!response.ok) {
      return { window: null, billingType: null, invalidCredential: false };
    }
    const data = await response.json();
    const parsed = parse(data);
    return { window: parsed.window, billingType: parsed.billingType, invalidCredential: false };
  } catch {
    return { window: null, billingType: null, invalidCredential: false };
  }
}
function parseRateLimitsResponse(data) {
  return { billingType: null, window: parseWindow(data) };
}
function parseBillingResponse(data) {
  const obj = toRecord(data);
  const billingType = typeof obj.billingType === "string" ? obj.billingType : "unknown";
  return { billingType, window: parseWindow(obj.data) };
}
function buildV0Quota(windows, billingType) {
  if (Object.keys(windows).length === 0) return null;
  const worstPercentUsed = Math.max(0, ...Object.values(windows).map((w) => w.percentUsed));
  const dominantWindow = Object.values(windows).find((w) => w.percentUsed === worstPercentUsed) ?? null;
  return {
    used: Math.round(worstPercentUsed * 100),
    total: 100,
    percentUsed: worstPercentUsed,
    resetAt: dominantWindow?.resetAt ?? null,
    windows,
    billingType
  };
}
async function fetchV0Quota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const apiKey = typeof connection?.apiKey === "string" && connection.apiKey.trim().length > 0 ? connection.apiKey : null;
  if (!apiKey) {
    return null;
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const windows = {};
  let billingType = "unknown";
  const billingResult = await fetchWindow(
    `${V0_CONFIG.baseUrl}${V0_CONFIG.billingPath}`,
    headers,
    parseBillingResponse
  );
  if (billingResult.window) {
    windows[V0_WINDOW_CREDITS] = billingResult.window;
    billingType = billingResult.billingType ?? "unknown";
  }
  const rateLimitsResult = await fetchWindow(
    `${V0_CONFIG.baseUrl}${V0_CONFIG.rateLimitsPath}`,
    headers,
    parseRateLimitsResponse
  );
  if (rateLimitsResult.window) {
    windows[V0_WINDOW_DAILY_OPS] = rateLimitsResult.window;
  }
  if (billingResult.invalidCredential || rateLimitsResult.invalidCredential) {
    quotaCache.delete(connectionId);
    return null;
  }
  const quota = buildV0Quota(windows, billingType);
  if (!quota) return null;
  quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
  return quota;
}
function invalidateV0QuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerV0QuotaFetcher() {
  registerQuotaFetcher("v0-vercel", fetchV0Quota);
  registerMonitorFetcher("v0-vercel", fetchV0Quota);
  registerQuotaWindows("v0-vercel", [V0_WINDOW_CREDITS, V0_WINDOW_DAILY_OPS]);
}
export {
  V0_WINDOW_CREDITS,
  V0_WINDOW_DAILY_OPS,
  fetchV0Quota,
  invalidateV0QuotaCache,
  registerV0QuotaFetcher
};
