/**
 * ADAPTED STUB — OmniRoute's @/shared/utils/featureFlags is app infra not
 * present in OryphemRouter. Graceful fallback: API keys not required.
 */
export function isRequireApiKeyEnabled() { return false; }
export default { isRequireApiKeyEnabled };
