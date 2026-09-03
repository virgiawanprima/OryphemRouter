/**
 * ADAPTED STUB — OmniRoute's @/lib/db/autoCandidateOverrides is app infra not
 * present in OryphemRouter. Graceful fallback: no excluded connection ids.
 */
export async function getExcludedConnectionIds() { return new Set(); }
export default { getExcludedConnectionIds };
