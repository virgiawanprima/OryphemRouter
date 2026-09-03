// ADAPTED STUB — OmniRoute `@/lib/db/readCache#getCachedProviderConnections`.
// OryphemRouter has no provider-connections DB; returns an empty list so the
// auto-combo virtual factory degrades to an empty candidate pool (graceful).
export async function getCachedProviderConnections(_opts) {
  return [];
}
export default { getCachedProviderConnections };
