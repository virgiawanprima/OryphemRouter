import { getModelSpec } from "../utils/omni/modelSpecs.js";
function hasExplicitReasoningField(body) {
  return body.reasoning_effort !== void 0 || body.reasoning !== void 0 || body.thinking !== void 0;
}
function applyDefaultReasoningEffort(body, modelId, suffixEffort, syncedDefaultEffort) {
  if (!body || typeof body !== "object") return body;
  if (hasExplicitReasoningField(body)) return body;
  const defaultEffort = suffixEffort || getModelSpec(modelId)?.defaultReasoningEffort || syncedDefaultEffort;
  if (!defaultEffort) return body;
  return { ...body, reasoning_effort: defaultEffort };
}
export {
  applyDefaultReasoningEffort
};
