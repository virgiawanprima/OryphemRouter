// ADAPTED STUB — OmniRoute `@/lib/modelCapabilities` surface consumed by the
// services/autoCombo port (createModelCapabilityResolutionSnapshot +
// getResolvedModelCapabilities). OryphemRouter has no model DB; this wraps the
// existing resolved-capabilities facade (utils/omni/omniModelCapabilities.js)
// and adds the supportsVision/supportsThinking fields the auto-combo candidate
// filters read, with graceful fallbacks.
import { getResolvedModelCapabilities as _resolve } from "./omniModelCapabilities.js";

/** Build-local capability snapshot; OryphemRouter has no DB-backed snapshot, so
 * an empty object is the graceful fallback. */
export function createModelCapabilityResolutionSnapshot() {
  return {};
}

export function getResolvedModelCapabilities(model, _opts, _snapshot) {
  const caps = _resolve(model, _opts);
  const reasoning = caps.reasoning === true;
  return {
    ...caps,
    supportsVision: caps.supportsVision === true,
    reasoning,
    supportsThinking: caps.supportsThinking === true || reasoning,
  };
}

export default { createModelCapabilityResolutionSnapshot, getResolvedModelCapabilities };
