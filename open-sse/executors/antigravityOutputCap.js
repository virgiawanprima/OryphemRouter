import { getExplicitModelOutputCap } from "../utils/omni/modelCapabilities.js";
import { isDiscoverableAntigravityModelId } from "../utils/omni/antigravityModelAliases.js";
const MAX_ANTIGRAVITY_OUTPUT_TOKENS = 16384;
function resolveAntigravityOutputCap(modelId) {
  const id = typeof modelId === "string" ? modelId.trim() : "";
  if (!id) return MAX_ANTIGRAVITY_OUTPUT_TOKENS;
  if (!isDiscoverableAntigravityModelId(id)) return MAX_ANTIGRAVITY_OUTPUT_TOKENS;
  try {
    const declared = getExplicitModelOutputCap({ provider: "antigravity", model: id });
    return typeof declared === "number" && Number.isFinite(declared) && declared > 0 ? declared : MAX_ANTIGRAVITY_OUTPUT_TOKENS;
  } catch {
    return MAX_ANTIGRAVITY_OUTPUT_TOKENS;
  }
}
export {
  MAX_ANTIGRAVITY_OUTPUT_TOKENS,
  resolveAntigravityOutputCap
};
