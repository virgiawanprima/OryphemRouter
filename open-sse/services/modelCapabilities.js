// Ported from OmniRoute open-sse/services/modelCapabilities.ts — a re-export shim that
// forwards to the adapted model-capabilities module in utils/omni (the OmniRoute original
// re-exports from the deep-infra `src/lib/modelCapabilities.ts`, which is not ported).

export {
  getResolvedModelCapabilities,
  supportsReasoning,
  supportsToolCalling,
} from "../utils/omni/omniModelCapabilities.js";
