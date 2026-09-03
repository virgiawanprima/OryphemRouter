const AZURE_COMPLETION_TOKEN_DEPLOYMENT = /(?:^|[/_-])(?:gpt-5|o(?:1|3|4))(?:[._-]|$)|^gpt-chat-latest$/i;
function applyAzureParamRules(model, originalBody, transformed) {
  if (!AZURE_COMPLETION_TOKEN_DEPLOYMENT.test(model)) return transformed;
  if (!transformed || typeof transformed !== "object" || Array.isArray(transformed)) {
    return transformed;
  }
  const original = originalBody && typeof originalBody === "object" && !Array.isArray(originalBody) ? originalBody : null;
  const normalized = { ...transformed };
  if (original?.max_completion_tokens !== void 0) {
    normalized.max_completion_tokens = original.max_completion_tokens;
  } else if (normalized.max_completion_tokens === void 0 && original?.max_tokens !== void 0) {
    normalized.max_completion_tokens = original.max_tokens;
  }
  delete normalized.max_tokens;
  if (normalized.temperature !== void 0 && normalized.temperature !== 1) {
    delete normalized.temperature;
  }
  const hasTools = Array.isArray(normalized.tools) && normalized.tools.length > 0;
  if (hasTools || normalized.reasoning_effort === "none") {
    delete normalized.reasoning_effort;
  }
  return normalized;
}
export {
  AZURE_COMPLETION_TOKEN_DEPLOYMENT,
  applyAzureParamRules
};
