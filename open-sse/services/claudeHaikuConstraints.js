const HAIKU_CONSTRAINT_PATTERN = /haiku/i;
const HAIKU_FALLBACK_THINKING_BUDGET = 1e4;
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function modelRejectsAdaptiveAndEffort(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return false;
  return HAIKU_CONSTRAINT_PATTERN.test(modelId);
}
function normalizeClaudeHaikuConstraints(body, model) {
  if (!modelRejectsAdaptiveAndEffort(model)) return body;
  const record = asRecord(body);
  if (!record) return body;
  const thinking = asRecord(record.thinking);
  const outputConfig = asRecord(record.output_config);
  const needsThinkingRewrite = thinking?.type === "adaptive";
  const needsEffortStrip = outputConfig != null && outputConfig.effort != null;
  if (!needsThinkingRewrite && !needsEffortStrip) return body;
  const next = { ...record };
  if (needsThinkingRewrite && thinking) {
    next.thinking = {
      ...thinking,
      type: "enabled",
      budget_tokens: HAIKU_FALLBACK_THINKING_BUDGET
    };
  }
  if (needsEffortStrip && outputConfig) {
    const nextOutputConfig = { ...outputConfig };
    delete nextOutputConfig.effort;
    if (Object.keys(nextOutputConfig).length === 0) {
      delete next.output_config;
    } else {
      next.output_config = nextOutputConfig;
    }
  }
  return next;
}
export {
  normalizeClaudeHaikuConstraints
};
