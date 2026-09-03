// Minimal stub for OmniRoute `src/domain/quotaCache.ts` (deep app infra).
// OryphemRouter has no domain-level quota cache; returns null/empty so the
// snapshot-synthesis path in opencodeQuotaFetcher degrades to null.
export function getQuotaCache() {
  return null;
}
export function getQuotaWindowStatus() {
  return null;
}
export function setQuotaCache() {}
export function isAccountQuotaExhausted() {
  return false;
}
