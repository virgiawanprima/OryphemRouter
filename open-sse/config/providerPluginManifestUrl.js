const PROVIDER_PLUGIN_MANIFEST_HEADER = "X-OmniRoute-Provider-Manifest-Url";
const PROVIDER_PLUGIN_MANIFEST_PATH = "/api/v1/provider-plugin-manifest";
function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}
function resolveProviderPluginManifestUrl(origin) {
  const configured = process.env.OMNIROUTE_PROVIDER_MANIFEST_URL?.trim();
  if (configured) return configured;
  if (origin) {
    return `${trimTrailingSlash(origin)}${PROVIDER_PLUGIN_MANIFEST_PATH}`;
  }
  const host = process.env.HOST || "127.0.0.1";
  const port = process.env.PORT || process.env.DASHBOARD_PORT || process.env.API_PORT || "20128";
  const protocol = process.env.OMNIROUTE_PUBLIC_PROTOCOL || "http";
  return `${protocol}://${host}:${port}${PROVIDER_PLUGIN_MANIFEST_PATH}`;
}
function getProviderPluginManifestHeader(origin) {
  return {
    [PROVIDER_PLUGIN_MANIFEST_HEADER]: resolveProviderPluginManifestUrl(origin)
  };
}
export {
  PROVIDER_PLUGIN_MANIFEST_HEADER,
  PROVIDER_PLUGIN_MANIFEST_PATH,
  getProviderPluginManifestHeader,
  resolveProviderPluginManifestUrl
};
