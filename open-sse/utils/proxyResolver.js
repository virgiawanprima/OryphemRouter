// Minimal proxy resolver for the ported TLS client layer.
// OryphemRouter doesn't ship OmniRoute's AsyncLocalStorage proxy-context system;
// default to direct connections (per-call overrides still win upstream).
export function resolveProxyForRequest() {
  return { source: "direct", proxyUrl: null };
}
