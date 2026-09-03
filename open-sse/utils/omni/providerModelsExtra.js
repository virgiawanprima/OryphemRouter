// ADAPTED STUB — ported from OmniRoute open-sse/config/providerModels.ts
// OryphemRouter's config/providerModels.js is the canonical model-table module; this
// leaf re-exports it and adds `supportsXHighEffort` (which the dest port does not
// export). Needed by claudeEffortVariants.js and registeredEffortVariants.js.
export * from "../../config/providerModels.js";

import { getProviderModels, getDefaultModel } from "../../config/providerModels.js";

/** True unless the provider model (or its canonical alias) opts out of xhigh effort. */
export function supportsXHighEffort(aliasOrId, modelId) {
  try {
    const providerModels = getProviderModels(aliasOrId) || [];
    const model = providerModels.find((entry) => entry && entry.id === modelId) || null;
    if (model && model.supportsXHighEffort !== undefined) {
      return model.supportsXHighEffort !== false;
    }
    const canonical = getDefaultModel(aliasOrId);
    if (canonical && canonical.supportsXHighEffort !== undefined) {
      return canonical.supportsXHighEffort !== false;
    }
  } catch {
    // fall through
  }
  return true;
}

export function supportsXHighEffortForMaxNormalization(aliasOrId, modelId) {
  return supportsXHighEffort(aliasOrId, modelId);
}
