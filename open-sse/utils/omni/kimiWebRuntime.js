const REASONING_EFFORT_PREFIX = "REASONING_EFFORT_";
const CONTEXT_LENGTH_PREFIX = "CONTEXT_LENGTH_";
const STATIC_MODEL_CONFIGS = {
  k3: {
    scenario: "SCENARIO_K2D5",
    supportedReasoningEfforts: ["REASONING_EFFORT_NONE", "REASONING_EFFORT_LOW"],
    defaultReasoningEffort: "REASONING_EFFORT_NONE",
    supportedContextLengths: []
  },
  k2d6: {
    scenario: "SCENARIO_K2D5",
    supportedReasoningEfforts: ["REASONING_EFFORT_NONE", "REASONING_EFFORT_LOW"],
    defaultReasoningEffort: "REASONING_EFFORT_NONE",
    supportedContextLengths: []
  }
};
function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function resolveKimiWebModelConfig(modelId) {
  return STATIC_MODEL_CONFIGS[modelId] || null;
}
function resolveKimiWebReasoningEffort(value, config) {
  const requested = toNonEmptyString(value);
  const normalized = requested ? requested.startsWith(REASONING_EFFORT_PREFIX) ? requested.toUpperCase() : `${REASONING_EFFORT_PREFIX}${requested.toUpperCase()}` : config.defaultReasoningEffort;
  if (!normalized) return void 0;
  if (!config.supportedReasoningEfforts.includes(normalized)) {
    throw new Error(`Kimi Web model does not support reasoning_effort=${requested || normalized}`);
  }
  return normalized;
}
function resolveKimiWebContextLength(value, config) {
  const requested = toNonEmptyString(value);
  const normalized = requested ? requested.startsWith(CONTEXT_LENGTH_PREFIX) ? requested.toUpperCase() : `${CONTEXT_LENGTH_PREFIX}${requested.toUpperCase()}` : config.defaultContextLength;
  if (!normalized) return void 0;
  if (!config.supportedContextLengths.includes(normalized)) {
    throw new Error(`Kimi Web model does not support context_length=${requested || normalized}`);
  }
  return normalized;
}
export {
  resolveKimiWebContextLength,
  resolveKimiWebModelConfig,
  resolveKimiWebReasoningEffort
};
