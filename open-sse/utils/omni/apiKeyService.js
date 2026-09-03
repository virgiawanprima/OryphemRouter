/**
 * ADAPTED STUB — replaces OmniRoute "@/lib/services/apiKey" for the NineRouter
 * executor. OryphemRouter has no API-key DB; getOrCreateApiKey() falls back to
 * the credential the caller already holds (apiKey/accessToken) or null.
 */
export async function getOrCreateApiKey(_provider) {
  return null;
}
