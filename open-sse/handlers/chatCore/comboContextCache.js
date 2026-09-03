import { getUpstreamProxyConfig } from "../../utils/omni/localDb.js";
const _proxyConfigCache = /* @__PURE__ */ new Map();
const PROXY_CONFIG_CACHE_TTL = 1e4;
let _combosPromise = null;
let _combosCacheTs = 0;
let _combosCacheVersionSnapshot = -1;
const COMBOS_CACHE_TTL = 1e4;
async function getCombosCached() {
  const now = Date.now();
  const { getCombos, getCombosCacheVersion } = await import("../../utils/omni/localDb.js");
  const version = getCombosCacheVersion();
  if (version !== _combosCacheVersionSnapshot) {
    clearCombosCache();
  }
  if (_combosPromise && now - _combosCacheTs < COMBOS_CACHE_TTL) {
    return _combosPromise;
  }
  _combosCacheTs = now;
  _combosCacheVersionSnapshot = version;
  _combosPromise = getCombos();
  return _combosPromise;
}
function clearCombosCache() {
  _combosPromise = null;
  _combosCacheTs = 0;
  _combosCacheVersionSnapshot = -1;
}
function clearUpstreamProxyConfigCache(providerId) {
  if (providerId) {
    _proxyConfigCache.delete(providerId);
    return;
  }
  _proxyConfigCache.clear();
}
async function getUpstreamProxyConfigCached(providerId) {
  const cached = _proxyConfigCache.get(providerId);
  if (cached && Date.now() - cached.ts < PROXY_CONFIG_CACHE_TTL) return cached;
  const cfg = await getUpstreamProxyConfig(providerId).catch(() => null);
  const result = cfg ? {
    mode: cfg.mode,
    enabled: cfg.enabled,
    cliproxyapiModelMapping: cfg.cliproxyapiModelMapping ?? null,
    fallbackBackend: cfg.fallbackBackend,
    ts: Date.now()
  } : {
    mode: "native",
    enabled: false,
    cliproxyapiModelMapping: null,
    fallbackBackend: "cliproxyapi",
    ts: Date.now()
  };
  _proxyConfigCache.set(providerId, result);
  return result;
}
export {
  clearCombosCache,
  clearUpstreamProxyConfigCache,
  getCombosCached,
  getUpstreamProxyConfigCached
};
