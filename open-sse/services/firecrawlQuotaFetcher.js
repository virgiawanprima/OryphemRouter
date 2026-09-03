import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
import { toNumberOrNull } from "../utils/omni/numeric.js";
const CREDIT_USAGE_URL = "https://api.firecrawl.dev/v2/team/credit-usage";
const CACHE_TTL_MS = 6e4;
const REQUEST_TIMEOUT_MS = 8e3;
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
function extractFirecrawlApiKey(connection) {
  if (typeof connection?.apiKey === "string" && connection.apiKey.trim()) {
    return connection.apiKey.trim();
  }
  const credentials = toRecord(connection?.credentials);
  if (typeof credentials.apiKey === "string" && credentials.apiKey.trim()) {
    return credentials.apiKey.trim();
  }
  return null;
}
function parseFirecrawlCreditUsage(data) {
  const root = toRecord(data);
  const payload = toRecord(root.data);
  const remaining = toNumberOrNull(payload.remainingCredits ?? payload.remaining_credits);
  const plan = toNumberOrNull(payload.planCredits ?? payload.plan_credits);
  if (remaining === null || plan === null || plan < 0) return null;
  const planCredits = Math.max(0, plan);
  const remainingCredits = Math.max(0, remaining);
  const extraCreditsInferred = Math.max(0, remainingCredits - planCredits);
  const overPlan = extraCreditsInferred > 0;
  const used = planCredits > 0 ? Math.max(0, planCredits - remainingCredits) : 0;
  const percentUsed = planCredits > 0 ? used / planCredits : remainingCredits <= 0 ? 1 : 0;
  const resetRaw = payload.billingPeriodEnd ?? payload.billing_period_end;
  const resetAt = typeof resetRaw === "string" && resetRaw.trim() ? resetRaw.trim() : null;
  return {
    used,
    total: planCredits,
    percentUsed,
    resetAt,
    remainingCredits,
    planCredits,
    extraCreditsInferred,
    overPlan,
    limitReached: remainingCredits <= 0 || percentUsed >= 1
  };
}
function getFirecrawlBaseUrl(connection) {
  const envBase = process.env.FIRECRAWL_BASE_URL?.trim();
  if (envBase && !envBase.includes("api.firecrawl.dev")) {
    return envBase.replace(/\/+$/, "");
  }
  const providerData = toRecord(connection?.providerSpecificData);
  const connBase = typeof connection?.baseUrl === "string" ? connection.baseUrl : providerData?.baseUrl;
  if (typeof connBase === "string" && connBase.trim() && !connBase.includes("api.firecrawl.dev")) {
    return connBase.trim().replace(/\/+$/, "");
  }
  return null;
}
async function fetchFirecrawlQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const customBase = getFirecrawlBaseUrl(connection);
  if (customBase) {
    return {
      used: 0,
      total: 0,
      percentUsed: 0,
      resetAt: null,
      remainingCredits: 0,
      planCredits: 0,
      extraCreditsInferred: 0,
      overPlan: false,
      limitReached: false
    };
  }
  const apiKey = extractFirecrawlApiKey(connection);
  if (!apiKey) {
    quotaCache.set(connectionId, { quota: null, fetchedAt: Date.now() });
    return null;
  }
  try {
    await throttleQuotaFetch();
    const response = await fetch(CREDIT_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.status === 401 || response.status === 403) {
      quotaCache.set(connectionId, { quota: null, fetchedAt: Date.now() });
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    const quota = parseFirecrawlCreditUsage(body);
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    quotaCache.set(connectionId, { quota: null, fetchedAt: Date.now() });
    return null;
  }
}
function invalidateFirecrawlQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerFirecrawlQuotaFetcher() {
  registerQuotaFetcher("firecrawl", fetchFirecrawlQuota);
  registerMonitorFetcher("firecrawl", fetchFirecrawlQuota);
}
export {
  extractFirecrawlApiKey,
  fetchFirecrawlQuota,
  getFirecrawlBaseUrl,
  invalidateFirecrawlQuotaCache,
  parseFirecrawlCreditUsage,
  registerFirecrawlQuotaFetcher
};
