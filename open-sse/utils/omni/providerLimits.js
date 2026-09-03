// ADAPTED — graceful fallback (was @/lib/usage/providerLimits).
export async function fetchLiveProviderLimits(_connectionId) {
  return null;
}
export function isSupportedUsageConnection(_connection) {
  return false;
}
export function hasUsableQuota(_usage) {
  return true;
}