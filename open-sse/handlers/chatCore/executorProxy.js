import { getExecutor } from "../../executors/index.js";
import { isCliproxyapiDeepModeEnabled } from "../../executors/cliproxyapi.js";
import { isDarioDeepModeEnabled } from "../../executors/dario.js";
import { getCachedSettings } from "../../utils/omni/readCache.js";
import { getUpstreamProxyConfigCached } from "./comboContextCache.js";
import { wrapExecutorWithCliproxyapiModelMapping } from "./cliproxyModelMapping.js";
import {
  resolveDedicatedCliproxyapiApiKey,
  wrapExecutorWithCliproxyapiCredentials
} from "./cliproxyapiCredentials.js";
const DEFAULT_FALLBACK_CODES = [429, 500, 502, 503, 504];
function parseFallbackCodes(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = raw.split(",").map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  return parsed.length > 0 ? parsed : null;
}
async function loadCliproxyapiSettings() {
  try {
    const allSettings = await getCachedSettings();
    return {
      fallbackCodes: parseFallbackCodes(allSettings.cliproxyapi_fallback_codes) ?? [
        ...DEFAULT_FALLBACK_CODES
      ],
      dedicatedApiKey: resolveDedicatedCliproxyapiApiKey(allSettings)
    };
  } catch {
    return { fallbackCodes: [...DEFAULT_FALLBACK_CODES], dedicatedApiKey: null };
  }
}
function resolveCliproxyapiExecutor(cliproxyapiModelMapping, dedicatedApiKey) {
  return wrapExecutorWithCliproxyapiCredentials(
    wrapExecutorWithCliproxyapiModelMapping(getExecutor("cliproxyapi"), cliproxyapiModelMapping),
    dedicatedApiKey
  );
}
async function resolveExecutorWithProxy(prov, log, providerSpecificData) {
  if (isCliproxyapiDeepModeEnabled(providerSpecificData)) {
    log?.info?.(
      "UPSTREAM_PROXY",
      `${prov} routed through CLIProxyAPI (per-connection claude-native override)`
    );
    return getExecutor("cliproxyapi");
  }
  if (isDarioDeepModeEnabled(providerSpecificData)) {
    log?.info?.(
      "UPSTREAM_PROXY",
      `${prov} routed through Dario (per-connection claude-native override)`
    );
    return getExecutor("dario");
  }
  const cfg = await getUpstreamProxyConfigCached(prov);
  if (!cfg.enabled || cfg.mode === "native") return getExecutor(prov);
  if (cfg.mode === "cliproxyapi") {
    log?.info?.("UPSTREAM_PROXY", `${prov} routed through CLIProxyAPI (passthrough)`);
    const { dedicatedApiKey: dedicatedApiKey2 } = await loadCliproxyapiSettings();
    return resolveCliproxyapiExecutor(cfg.cliproxyapiModelMapping, dedicatedApiKey2);
  }
  if (cfg.mode === "dario") {
    log?.info?.("UPSTREAM_PROXY", `${prov} routed through Dario (passthrough)`);
    return getExecutor("dario");
  }
  const nativeExec = getExecutor(prov);
  const fallbackBackend = cfg.fallbackBackend;
  const { fallbackCodes, dedicatedApiKey } = await loadCliproxyapiSettings();
  const proxyExec = fallbackBackend === "dario" ? getExecutor("dario") : resolveCliproxyapiExecutor(cfg.cliproxyapiModelMapping, dedicatedApiKey);
  const backendLabel = fallbackBackend === "dario" ? "Dario" : "CLIProxyAPI";
  const isRetryableStatus = (s) => fallbackCodes.includes(s) || s === 0;
  const wrapper = Object.create(nativeExec);
  wrapper.execute = async (input) => {
    let result;
    try {
      result = await nativeExec.execute(input);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log?.info?.("UPSTREAM_PROXY", `${prov} native error (${errMsg}), retrying via ${backendLabel}`);
      try {
        return await proxyExec.execute(input);
      } catch (proxyErr) {
        const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        log?.error?.("UPSTREAM_PROXY", `${prov} ${backendLabel} fallback also failed: ${proxyMsg}`);
        throw proxyErr;
      }
    }
    if (!isRetryableStatus(result.response.status)) {
      return result;
    }
    log?.info?.(
      "UPSTREAM_PROXY",
      `${prov} native failed (${result.response.status}), retrying via ${backendLabel}`
    );
    try {
      return await proxyExec.execute(input);
    } catch (proxyErr) {
      const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      log?.error?.("UPSTREAM_PROXY", `${prov} ${backendLabel} fallback also failed: ${proxyMsg}`);
      throw proxyErr;
    }
  };
  return wrapper;
}
export {
  resolveExecutorWithProxy
};
