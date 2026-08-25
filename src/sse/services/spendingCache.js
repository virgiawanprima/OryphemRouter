// Shared in-memory cache for spending-limit queries (see src/sse/handlers/chat.js).
// Lives in its own module so usage recording (usageRepo) and the settings route
// can invalidate it without importing the full chat handler (avoids heavy or
// circular imports).
const SPENDING_LIMITS_CACHE_TTL_MS = 15_000;
const spendingLimitsCache = new Map(); // key → { monthly, daily, ts }

export function getSpendingLimitsCache() {
  return spendingLimitsCache;
}

export function getSpendingLimitsCacheTtlMs() {
  return SPENDING_LIMITS_CACHE_TTL_MS;
}

export function invalidateSpendingCache() {
  spendingLimitsCache.clear();
}
