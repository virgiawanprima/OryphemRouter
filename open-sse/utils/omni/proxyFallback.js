// ADAPTED STUB — OmniRoute `open-sse/utils/proxyFallback.ts` maintains an
// in-memory working-proxy cache (5-min TTL) used by proxyAutoSelector.
// OryphemRouter proxy selection is handled elsewhere (utils/networkProxy.js);
// this graceful no-op disables auto proxy selection without crashing.
const proxyFallbackCache = new Map();

/**
 * Find a working proxy for a target URL. No-op here — returns null so the
 * caller falls back to direct connection.
 */
export async function findWorkingProxy(_hostname, _targetUrl) {
  return null;
}

export function clearProxyFallbackCache() {
  proxyFallbackCache.clear();
}
