function resolveTlsClientProxyUrl(targetUrl, perCall, resolveProxyForRequest) {
  if (perCall && perCall.length > 0) return perCall;
  let info;
  try {
    info = resolveProxyForRequest(targetUrl);
  } catch (err) {
    throw new Error(
      `[TlsClient] Proxy resolution failed for ${targetUrl}; refusing direct connection (fail-closed): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return info && info.proxyUrl ? info.proxyUrl : void 0;
}
export {
  resolveTlsClientProxyUrl
};
