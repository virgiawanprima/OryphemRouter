/**
 * ADAPTED STUB — OmniRoute's @/lib/db/providers (getProviderConnectionById /
 * getProviderConnections) is app infra not present in OryphemRouter.
 * Graceful fallbacks: no connection rows.
 */
export async function getProviderConnectionById() { return null; }
export async function getProviderConnections() { return []; }
export default { getProviderConnectionById, getProviderConnections };
