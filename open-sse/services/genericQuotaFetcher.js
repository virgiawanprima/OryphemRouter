import { getUsageForProvider, USAGE_FETCHER_PROVIDERS } from "../utils/omni/usageFetcherProviders.js";
import {
  getQuotaFetcher,
  registerQuotaFetcher,
  registerQuotaWindows
} from "./quotaPreflight.js";
const CACHE_TTL_MS = 6e4;
const cache = /* @__PURE__ */ new Map();
function cacheKey(provider, connectionId) {
  return `${provider}::${connectionId}`;
}
const _cacheCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS * 5) cache.delete(key);
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
function percentUsedForQuota(entry) {
  if (!entry || typeof entry !== "object") return null;
  const q = entry;
  if (q.unlimited === true) return null;
  if (q.fractionReported === false) return null;
  const remainingPercentage = toNumber(q.remainingPercentage);
  if (remainingPercentage !== null) {
    const used2 = (100 - Math.max(0, Math.min(100, remainingPercentage))) / 100;
    return used2;
  }
  const used = toNumber(q.used);
  const total = toNumber(q.total);
  if (used !== null && total !== null && total > 0) {
    return Math.max(0, Math.min(1, used / total));
  }
  return null;
}
function resetAtForQuota(entry) {
  if (!entry || typeof entry !== "object") return null;
  const q = entry;
  return typeof q.resetAt === "string" ? q.resetAt : null;
}
function convertUsageToQuotaInfo(usage) {
  if (!usage || typeof usage !== "object") return null;
  const usageRecord = usage;
  if (typeof usageRecord.message === "string" && (!usageRecord.quotas || typeof usageRecord.quotas !== "object")) {
    return null;
  }
  const quotasObj = usageRecord.quotas;
  if (!quotasObj || typeof quotasObj !== "object" || Array.isArray(quotasObj)) {
    return null;
  }
  const windows = {};
  let worstPercent = 0;
  let worstResetAt = null;
  for (const [name, entry] of Object.entries(quotasObj)) {
    const percentUsed = percentUsedForQuota(entry);
    if (percentUsed === null) continue;
    const resetAt = resetAtForQuota(entry);
    windows[name] = { percentUsed, resetAt };
    if (percentUsed > worstPercent) {
      worstPercent = percentUsed;
      worstResetAt = resetAt;
    }
  }
  if (Object.keys(windows).length === 0) return null;
  return {
    used: 0,
    total: 0,
    percentUsed: worstPercent,
    resetAt: worstResetAt,
    windows,
    limitReached: worstPercent >= 1 - 1e-9
  };
}
const fetchGenericQuota = async (connectionId, connection) => {
  if (!connection) return null;
  const conn = connection;
  const provider = typeof conn.provider === "string" ? conn.provider : null;
  if (!provider) return null;
  const key = cacheKey(provider, connectionId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quota;
  }
  let usage;
  try {
    usage = await getUsageForProvider(conn);
  } catch {
    return null;
  }
  const quota = convertUsageToQuotaInfo(usage);
  if (!quota) return null;
  registerQuotaWindows(provider, Object.keys(quota.windows || {}));
  cache.set(key, { quota, fetchedAt: Date.now() });
  return quota;
};
function invalidateGenericQuotaCache(provider, connectionId) {
  cache.delete(cacheKey(provider, connectionId));
}
function registerGenericQuotaFetchers() {
  for (const provider of USAGE_FETCHER_PROVIDERS) {
    if (getQuotaFetcher(provider)) continue;
    registerQuotaFetcher(provider, fetchGenericQuota);
  }
}
export {
  convertUsageToQuotaInfo,
  fetchGenericQuota,
  invalidateGenericQuotaCache,
  registerGenericQuotaFetchers
};
