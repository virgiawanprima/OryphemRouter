/**
 * ADAPTED STUB — replaces OmniRoute "@/lib/db/settings" for the ported
 * open-sse tree.
 *
 * unified by integration — canonical settings facade for open-sse/utils/omni.
 * Merges the parallel ports: dbSettings.js (getSettings), settings.js
 * (getSettings/getSetting), dbSettingsProxy.js (resolveProxyForConnection) and
 * lib-db-settings.js (resolveProxyForConnection). Those files re-export from
 * here so every importer resolves the same definitions. OryphemRouter has no
 * settings DB, so getSettings() resolves to an empty object and cliproxyapi
 * falls back to env vars / defaults; proxy resolution falls back to "direct".
 */
export async function getSettings() {
  return {};
}

export async function getSetting(key, fallback = undefined) {
  return fallback;
}

/** Resolve a proxy record for a connection. Graceful: direct connection. */
export async function resolveProxyForConnection(_connectionId, _apiKeyId, _providerId) {
  return { proxy: null, level: "direct" };
}

export default { getSettings, getSetting, resolveProxyForConnection };
