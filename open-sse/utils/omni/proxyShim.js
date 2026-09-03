/**
 * ADAPTED STUB — replaces the runWithProxyContext() the TheOldLlm executor
 * imports from OmniRoute open-sse/utils/proxyFetch.ts. OryphemRouter's
 * proxyFetch.js does not expose it; when no proxy is assigned this is a
 * pass-through that runs the request directly.
 */
export async function runWithProxyContext(_proxy, request) {
  return request();
}
