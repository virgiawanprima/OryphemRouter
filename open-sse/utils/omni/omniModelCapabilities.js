// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/modelCapabilities.ts` (~41KB) resolves per-model capabilities from
// the provider registry + a model DB. That is deep app infra. This self-contained variant
// provides the subset consumed by the ported generic services (`contextManager`,
// `taskAwareRouting` via `services/modelCapabilities.js`) with graceful fallbacks.
//
// unified by integration — omniModelCapabilities.js is the resolved-capabilities
// facade (context window / max output / reasoning / tool calling) of the
// modelCapabilities/modelSpecs cluster; getModelSpec (spec-table facade) is
// unified in ./modelSpecs.js and ./modelCapabilities.js. Its internal getModelSpec
// helper below is a different facet (context/max-output snapshot) and stays local.

function getModelSpec(modelId) {
  if (typeof modelId !== "string" || !modelId) return undefined;
  const normalized = modelId.toLowerCase();
  const bare = normalized.split("/").pop() || normalized;
  const known = {
    "gpt-4o": { contextWindow: 128000, maxOutputTokens: 16384 },
    "gpt-4o-mini": { contextWindow: 128000, maxOutputTokens: 16384 },
    "gpt-5": { contextWindow: 400000, maxOutputTokens: 64000, reasoning: true },
    "claude-opus-4": { contextWindow: 200000, maxOutputTokens: 32000 },
    "claude-opus-4-5": { contextWindow: 200000, maxOutputTokens: 64000, reasoning: true },
    "claude-sonnet-4": { contextWindow: 200000, maxOutputTokens: 64000 },
    "claude-sonnet-4-5": { contextWindow: 200000, maxOutputTokens: 64000, reasoning: true },
    "claude-haiku-4-5": { contextWindow: 200000, maxOutputTokens: 10000 },
    "gemini-2.5-pro": { contextWindow: 1000000, maxOutputTokens: 65536, reasoning: true },
    "gemini-2.5-flash": { contextWindow: 1000000, maxOutputTokens: 65536, reasoning: true },
  };
  if (known[bare]) return known[bare];
  for (const key of Object.keys(known)) {
    if (bare.startsWith(key)) return known[key];
  }
  return undefined;
}

/** Best-effort resolved capability snapshot for a model. */
export function getResolvedModelCapabilities(model, opts = {}) {
  const spec = getModelSpec(model);
  return {
    model,
    contextWindow: spec?.contextWindow ?? 200_000,
    maxOutputTokens: spec?.maxOutputTokens ?? 8192,
    reasoning: Boolean(spec?.reasoning),
    toolCalling: true,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
  };
}

/** Get the context (input) window limit in tokens for a model. */
export function getModelContextLimit(model) {
  return getResolvedModelCapabilities(model).contextWindow;
}

export function supportsReasoning(model) {
  return Boolean(getModelSpec(model)?.reasoning);
}

export function supportsToolCalling(model) {
  return true;
}
