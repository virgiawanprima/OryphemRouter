/**
 * ADAPTED STUB — OmniRoute's services/reasoningCache.ts is app infra not
 * present in OryphemRouter. These predicates are used by schemaCoercion to
 * decide whether empty reasoning content must be injected for DeepSeek-style
 * routes; returning false disables that injection (graceful no-op).
 */
export function isDeepSeekReasoningModel() { return false; }
export function requiresReasoningReplay() { return false; }
export default { isDeepSeekReasoningModel, requiresReasoningReplay };
