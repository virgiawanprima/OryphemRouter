/**
 * ADAPTED STUB — OmniRoute's services/accountFallback.ts also exports
 * isModelLocked(provider, connectionId, model). OryphemRouter's ported
 * accountFallback.js does not include it; graceful fallback: never locked.
 */
export function isModelLocked() { return false; }
export default { isModelLocked };
