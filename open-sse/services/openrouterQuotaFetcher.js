import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
import {
  getFreeWindowStatus,
  isFreeVariantModel,
  resolveAccountKey
} from "./openrouterFreeWindow.js";
const OPENROUTER_CONFIG = {
  baseUrl: "https://openrouter.ai/api/v1",
  keyPath: "/key",
  creditsPath: "/credits"
};
const CACHE_TTL_MS = 45e3;
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
function toNullableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function toFiniteNumber(value, fallback = 0) {
  const n = toNullableNumber(value);
  return n === null ? fallback : n;
}
function toIsoOrNull(value) {
  const n = toNullableNumber(value);
  if (n === null) return null;
  const date = new Date(n < 1e12 ? n * 1e3 : n);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return null;
  return date.toISOString();
}
function parseOpenrouterKeyResponse(data) {
  const outer = toRecord(data);
  const inner = "data" in outer ? toRecord(outer.data) : outer;
  if (Object.keys(inner).length === 0) return null;
  return {
    limit: toNullableNumber(inner.limit),
    limitRemaining: toNullableNumber(inner.limit_remaining),
    limitReset: toIsoOrNull(inner.limit_reset),
    isFreeTier: inner.is_free_tier === true,
    usage: toFiniteNumber(inner.usage, 0),
    usageDaily: toFiniteNumber(inner.usage_daily, 0),
    usageWeekly: toFiniteNumber(inner.usage_weekly, 0),
    usageMonthly: toFiniteNumber(inner.usage_monthly, 0),
    byokUsage: toNullableNumber(inner.byok_usage),
    includeByokInLimit: inner.include_byok_in_limit === true
  };
}
function parseOpenrouterCreditsResponse(data) {
  const outer = toRecord(data);
  const inner = "data" in outer ? toRecord(outer.data) : outer;
  return {
    totalCredits: toNullableNumber(inner.total_credits),
    totalUsage: toNullableNumber(inner.total_usage)
  };
}
function buildQuotaFromParts(key, credits) {
  const hasCap = key.limit !== null && key.limitRemaining !== null;
  const limitReached = hasCap && key.limitRemaining <= 0;
  const percentUsed = hasCap && key.limit > 0 ? 1 - key.limitRemaining / key.limit : 0;
  const creditBalance = key.limitRemaining !== null ? key.limitRemaining : credits.totalCredits !== null && credits.totalUsage !== null ? credits.totalCredits - credits.totalUsage : null;
  return {
    used: percentUsed * 100,
    total: 100,
    percentUsed,
    resetAt: key.limitReset,
    limitReached,
    limit: key.limit,
    limitRemaining: key.limitRemaining,
    isFreeTier: key.isFreeTier,
    usage: key.usage,
    usageDaily: key.usageDaily,
    usageWeekly: key.usageWeekly,
    usageMonthly: key.usageMonthly,
    byokUsage: key.byokUsage,
    includeByokInLimit: key.includeByokInLimit,
    totalCredits: credits.totalCredits,
    totalUsage: credits.totalUsage,
    creditBalance
  };
}
function buildFreeWindowExhaustedQuota(status) {
  const percentUsed = status.dailyLimit > 0 ? status.dailyUsed / status.dailyLimit : 1;
  return {
    used: status.dailyUsed,
    total: status.dailyLimit,
    percentUsed: Math.min(1, Math.max(0, percentUsed)),
    resetAt: status.dailyResetAt,
    limitReached: true
  };
}
function checkFreeWindowExhausted(connectionId, connection, requestedModel) {
  if (!isFreeVariantModel(typeof requestedModel === "string" ? requestedModel : null)) {
    return null;
  }
  const accountKey = resolveAccountKey(connectionId, connection);
  const status = getFreeWindowStatus(accountKey);
  return status.dailyRemaining <= 0 ? buildFreeWindowExhaustedQuota(status) : null;
}
async function fetchJson(url, apiKey) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) return { status: response.status, data: null };
    const data = await response.json();
    return { status: response.status, data };
  } catch {
    return null;
  }
}
async function fetchOpenrouterQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const apiKey = typeof connection?.apiKey === "string" && connection.apiKey.trim().length > 0 ? connection.apiKey : null;
  if (!apiKey) return null;
  try {
    await throttleQuotaFetch();
    const keyUrl = `${OPENROUTER_CONFIG.baseUrl}${OPENROUTER_CONFIG.keyPath}`;
    const keyResult = await fetchJson(keyUrl, apiKey);
    if (!keyResult || keyResult.status === 401 || keyResult.status === 403) {
      quotaCache.delete(connectionId);
      return null;
    }
    if (keyResult.status !== 200) return null;
    const keyFields = parseOpenrouterKeyResponse(keyResult.data);
    if (!keyFields) return null;
    const creditsUrl = `${OPENROUTER_CONFIG.baseUrl}${OPENROUTER_CONFIG.creditsPath}`;
    const creditsResult = await fetchJson(creditsUrl, apiKey);
    const creditsFields = creditsResult && creditsResult.status === 200 ? parseOpenrouterCreditsResponse(creditsResult.data) : { totalCredits: null, totalUsage: null };
    const quota = buildQuotaFromParts(keyFields, creditsFields);
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateOpenrouterQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
async function fetchOpenrouterQuotaWithFreeWindowPreflight(connectionId, connection) {
  const freeWindowExhausted = checkFreeWindowExhausted(
    connectionId,
    connection,
    connection?.requestedModel
  );
  return freeWindowExhausted ?? fetchOpenrouterQuota(connectionId, connection);
}
function registerOpenrouterQuotaFetcher() {
  registerQuotaFetcher("openrouter", fetchOpenrouterQuotaWithFreeWindowPreflight);
  registerMonitorFetcher("openrouter", fetchOpenrouterQuotaWithFreeWindowPreflight);
}
export {
  fetchOpenrouterQuota,
  fetchOpenrouterQuotaWithFreeWindowPreflight,
  invalidateOpenrouterQuotaCache,
  parseOpenrouterCreditsResponse,
  parseOpenrouterKeyResponse,
  registerOpenrouterQuotaFetcher
};
