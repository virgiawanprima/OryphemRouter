// ADAPTED — graceful fallback (was @/lib/db/readCache).
// Returns empty settings object (cached settings live in app DB infra).
export async function getCachedSettings() {
  return {};
}
export async function getCombosCacheVersion() {
  return 0;
}