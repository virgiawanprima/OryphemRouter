import { AsyncLocalStorage } from "node:async_hooks";
const probeContext = new AsyncLocalStorage();
function runAsProbe(fn) {
  return probeContext.run({ probe: true }, fn);
}
function isProbeContext() {
  return probeContext.getStore() !== void 0;
}
async function shouldIsolateProbeFailures() {
  if (!isProbeContext()) return false;
  try {
    const { isFeatureFlagEnabled } = await import("@/shared/utils/featureFlags");
    if (isFeatureFlagEnabled("PROBE_CAN_DISABLE")) return false;
  } catch {
  }
  try {
    const { getCachedSettings } = await import("@/lib/db/readCache");
    const settings = await getCachedSettings();
    return !settings.probeCanDisable;
  } catch {
    return true;
  }
}
export {
  isProbeContext,
  runAsProbe,
  shouldIsolateProbeFailures
};
