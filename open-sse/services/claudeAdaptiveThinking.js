import {
  getMaxEffortWhenThinkingDisabled,
  isAdaptiveThinkingOnly
} from "../utils/omni/modelSpecs.js";
const DIRECT_ANTHROPIC_API_PROVIDERS = /* @__PURE__ */ new Set(["anthropic", "claude"]);
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function normalizeClaudeAdaptiveThinking(body, model) {
  if (!isAdaptiveThinkingOnly(model)) return body;
  const record = asRecord(body);
  if (!record) return body;
  const thinking = asRecord(record.thinking);
  if (!thinking) return body;
  const isManualType = thinking.type === "enabled";
  const hasBudget = thinking.budget_tokens !== void 0 || thinking.max_tokens !== void 0;
  if (!isManualType && !hasBudget) return body;
  const nextThinking = { ...thinking };
  if (nextThinking.type === "enabled") nextThinking.type = "adaptive";
  delete nextThinking.budget_tokens;
  delete nextThinking.max_tokens;
  return { ...body, thinking: nextThinking };
}
function normalizeClaudeDisabledThinkingEffort(body, model, provider) {
  if (!provider || !DIRECT_ANTHROPIC_API_PROVIDERS.has(provider)) return body;
  const disabledEffortCap = getMaxEffortWhenThinkingDisabled(model);
  if (disabledEffortCap !== "high") return body;
  const record = asRecord(body);
  const thinking = asRecord(record?.thinking);
  const outputConfig = asRecord(record?.output_config);
  const effort = typeof outputConfig?.effort === "string" ? outputConfig.effort.toLowerCase() : "";
  if (thinking?.type !== "disabled" || !outputConfig || effort !== "xhigh" && effort !== "max") {
    return body;
  }
  return {
    ...body,
    output_config: { ...outputConfig, effort: disabledEffortCap }
  };
}
export {
  normalizeClaudeAdaptiveThinking,
  normalizeClaudeDisabledThinkingEffort
};
