// ADAPTED STUB — ported from OmniRoute src/shared/constants/modelSpecs.ts
//
// unified by integration — canonical model-spec facade for open-sse/utils/omni.
// Merges the parallel ports: modelSpecs.js (claude effort/thinking budgets for
// claudeEffortVariants.js / noThinkingAlias.js / cloudCodeThinking.js /
// bedrock.js / claudeAdaptiveThinking.js) and omniModelSpecs.js (adaptive-only
// claude models). omniModelSpecs.js re-exports from here so every importer
// resolves the same merged spec table; unknown models return undefined
// (graceful fallback).
const MODEL_SPECS = {
  // ── from modelSpecs.js (claude effort / thinking budgets) ──────────────
  "claude-opus-4": { supportsThinking: true, thinkingBudgetCap: 32000 },
  "claude-opus-4-1": { supportsThinking: true, thinkingBudgetCap: 32000 },
  "claude-opus-4-5": { supportsThinking: true, thinkingBudgetCap: 128000 },
  "claude-sonnet-4": { supportsThinking: true, thinkingBudgetCap: 64000 },
  "claude-sonnet-4-5": { supportsThinking: true, thinkingBudgetCap: 64000 },
  "claude-haiku-4-5": { supportsThinking: true, thinkingBudgetCap: 10000 },
  // ── from omniModelSpecs.js (adaptive-thinking-only claude models) ───────
  "claude-opus-4-7": { supportsThinking: true, adaptiveThinkingOnly: true },
  "claude-opus-4-8": { supportsThinking: true, adaptiveThinkingOnly: true },
  "claude-opus-5": {
    supportsThinking: true,
    adaptiveThinkingOnly: true,
    maxEffortWhenThinkingDisabled: "high",
  },
  "claude-fable-5": { supportsThinking: true, adaptiveThinkingOnly: true },
};

function getCanonicalModelSpecId(modelId) {
  if (typeof modelId !== "string" || !modelId) return undefined;
  const normalized = modelId.toLowerCase();
  // Strip common alias prefixes (claude/, anthropic/, ...)
  const bare = normalized.split("/").pop() || normalized;
  if (MODEL_SPECS[bare]) return bare;
  // Longest-prefix fallback (e.g. "claude-opus-4-5-20251101" -> "claude-opus-4-5")
  for (const key of Object.keys(MODEL_SPECS)) {
    if (bare.startsWith(key)) return key;
  }
  return undefined;
}

export function getModelSpec(modelId) {
  const canonical = getCanonicalModelSpecId(modelId);
  return canonical ? MODEL_SPECS[canonical] : undefined;
}

// Added for claudeAdaptiveThinking.js (OmniRoute src/shared/constants/modelSpecs.ts).
// Returns "high" only when the spec declares maxEffortWhenThinkingDisabled.
export function getMaxEffortWhenThinkingDisabled(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  return getModelSpec(modelId)?.maxEffortWhenThinkingDisabled ?? null;
}

export function capThinkingBudget(modelId, budget) {
  const cap = getModelSpec(modelId)?.thinkingBudgetCap ?? budget;
  return Math.min(budget, cap);
}

export function isAdaptiveThinkingOnly(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return false;
  return getModelSpec(modelId)?.adaptiveThinkingOnly === true;
}
