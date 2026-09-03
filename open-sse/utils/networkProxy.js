let _cachedConfig = null;
let _cacheExpiry = 0;
async function getConfig() {
  const now = Date.now();
  if (_cachedConfig && now < _cacheExpiry) return _cachedConfig;
  try {
    const { getProxyConfig } = await import("./omni/localDb.js");
    _cachedConfig = await getProxyConfig();
    _cacheExpiry = now + 3e4;
    return _cachedConfig;
  } catch {
    return { global: null, providers: {} };
  }
}
async function resolveProxy(providerId) {
  const config = await getConfig();
  if (providerId && config.providers?.[providerId]) {
    return config.providers[providerId];
  }
  if (config.global) {
    return config.global;
  }
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (envProxy) {
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
    if (noProxy && providerId) {
      const noProxyList = noProxy.split(",").map((s) => s.trim().toLowerCase());
      if (noProxyList.includes(providerId.toLowerCase())) {
        return null;
      }
    }
    return envProxy;
  }
  return null;
}
function invalidateProxyCache() {
  _cachedConfig = null;
  _cacheExpiry = 0;
}
export {
  invalidateProxyCache,
  resolveProxy
};
