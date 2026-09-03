// unified by integration — canonical definitions live in ./modelSpecs.js
// (omniModelSpecs.js was a parallel port of OmniRoute's
// src/shared/constants/modelSpecs.ts for claudeAdaptiveThinking.js; the merged
// spec table now lives in modelSpecs.js, which this file re-exports so both
// paths resolve identically).
export {
  getModelSpec,
  isAdaptiveThinkingOnly,
  getMaxEffortWhenThinkingDisabled,
  capThinkingBudget,
} from "./modelSpecs.js";
