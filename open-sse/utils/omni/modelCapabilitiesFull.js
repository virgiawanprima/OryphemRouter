// ADAPTED STUB — merged facade over the OmniRoute `@/lib/modelCapabilities`
// surface consumed by reasoningTokenBuffer + thinkingBudget. Combines exports
// split across the sibling stubs modelCapabilities.js (output-cap facade),
// omniModelCapabilities.js (resolved-capabilities facade) and modelSpecs.js
// (thinking-budget caps).
export {
  getModelContextLimit,
  getResolvedModelCapabilities,
  supportsReasoning,
  supportsToolCalling,
} from "./omniModelCapabilities.js";
export { getExplicitModelOutputCap, getModelSpec } from "./modelCapabilities.js";
export { capThinkingBudget } from "./modelSpecs.js";

const DEFAULT_THINKING_BUDGET = 8192;

export function getDefaultThinkingBudget(input) {
  const resolved = getResolvedModelCapabilities(input);
  return resolved.defaultThinkingBudget ?? DEFAULT_THINKING_BUDGET;
}
