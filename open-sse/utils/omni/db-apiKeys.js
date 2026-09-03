/**
 * ADAPTED STUB — OmniRoute's @/lib/db/apiKeys is app infra not present in
 * OryphemRouter. Graceful fallbacks: keys do not resolve / do not validate.
 */
export async function getApiKeyById() { return null; }
export async function getApiKeyMetadata() { return null; }
export async function validateApiKey() { return false; }
export default { getApiKeyById, getApiKeyMetadata, validateApiKey };
