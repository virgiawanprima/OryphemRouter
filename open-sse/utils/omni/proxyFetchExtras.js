// ADAPTED STUB (runWithProxyContext was exported from utils/proxyFetch.ts in OmniRoute;
// OryphemRouter proxyFetch.js exposes proxyAwareFetch/patchedFetch only).
export async function runWithProxyContext(fn, _proxyOptions) {
  if (typeof fn !== "function") throw new Error("runWithProxyContext requires a function");
  return fn({});
}
