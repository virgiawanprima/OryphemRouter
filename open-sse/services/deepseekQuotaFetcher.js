import { registerQuotaFetcher } from "./quotaPreflight.js";
import { registerMonitorFetcher } from "./quotaMonitor.js";
import { throttleQuotaFetch } from "./quotaFetchThrottle.js";
const DEEPSEEK_CONFIG = {
  baseUrl: "https://api.deepseek.com",
  balancePath: "/user/balance"
};
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
function toArray(value) {
  return Array.isArray(value) ? value : [];
}
function parseDeepseekQuotaResponse(data) {
  const obj = toRecord(data);
  const isAvailable = obj.is_available ?? obj.isAvailable;
  const isAvailableBool = isAvailable === true;
  const balanceInfos = parseAllBalanceInfos(obj);
  if (!balanceInfos || balanceInfos.length === 0) {
    return null;
  }
  const hasPositiveBalance = balanceInfos.some((b) => b.balance > 0);
  const limitReached = !isAvailableBool || !hasPositiveBalance;
  const percentUsed = limitReached ? 1 : 0;
  return {
    used: percentUsed * 100,
    total: 100,
    percentUsed,
    resetAt: null,
    // DeepSeek doesn't expose reset times
    balances: balanceInfos,
    isAvailable: isAvailableBool,
    limitReached,
    windowDaily: { percentUsed, resetAt: null }
  };
}
function parseAllBalanceInfos(data) {
  const obj = toRecord(data);
  const balanceInfos = toArray(obj.balance_infos);
  const results = [];
  for (const item of balanceInfos) {
    const record = toRecord(item);
    const currency = typeof record.currency === "string" ? record.currency.toUpperCase() : "";
    const totalBalance = toNumber(record.total_balance ?? record.totalBalance, 0);
    const grantedBalance = toNumber(record.granted_balance ?? record.grantedBalance, 0);
    const toppedUpBalance = toNumber(record.topped_up_balance ?? record.toppedUpBalance, 0);
    if (currency) {
      results.push({
        currency,
        totalBalance,
        balance: totalBalance,
        grantedBalance,
        toppedUpBalance
      });
    }
  }
  return results;
}
async function fetchDeepseekQuota(connectionId, connection) {
  const cached = quotaCache.get(connectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  const apiKey = typeof connection?.apiKey === "string" && connection.apiKey.trim().length > 0 ? connection.apiKey : null;
  if (!apiKey) {
    return null;
  }
  const url = `${DEEPSEEK_CONFIG.baseUrl}${DEEPSEEK_CONFIG.balancePath}`;
  try {
    await throttleQuotaFetch();
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    const quota = parseDeepseekQuotaResponse(data);
    if (!quota) return null;
    quotaCache.set(connectionId, { quota, fetchedAt: Date.now() });
    return quota;
  } catch {
    return null;
  }
}
function invalidateDeepseekQuotaCache(connectionId) {
  quotaCache.delete(connectionId);
}
function registerDeepseekQuotaFetcher() {
  registerQuotaFetcher("deepseek", fetchDeepseekQuota);
  registerMonitorFetcher("deepseek", fetchDeepseekQuota);
}
export {
  fetchDeepseekQuota,
  invalidateDeepseekQuotaCache,
  registerDeepseekQuotaFetcher
};
