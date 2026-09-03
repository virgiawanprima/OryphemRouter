import { getModelSpec } from "../utils/omni/modelSpecs.js";
const CLOUD_CODE_REASONING_UNSUPPORTED_PATTERNS = [/^claude-/i, /^gpt-oss-/i, /^tab_/i];
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const PREFIX_TRIM_RE = /^(?:models\/|antigravity\/)+/i;
function normalizeCloudCodeModel(model) {
  return String(model || "").trim().replace(PREFIX_TRIM_RE, "");
}
function stripGeminiThinkingConfig(value) {
  if (!isRecord(value)) return value;
  if (!("thinkingConfig" in value) && !("thinking_config" in value)) return value;
  const next = { ...value };
  delete next.thinkingConfig;
  delete next.thinking_config;
  return next;
}
function shouldStripCloudCodeThinking(provider, model) {
  if (!provider || !model) return false;
  const normalizedModel = normalizeCloudCodeModel(model);
  if (CLOUD_CODE_REASONING_UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(normalizedModel))) {
    return true;
  }
  const spec = getModelSpec(normalizedModel);
  if (typeof spec?.supportsThinking === "boolean") {
    return !spec.supportsThinking;
  }
  return false;
}
function stripCloudCodeThinkingConfig(body) {
  const next = { ...body };
  delete next.reasoning_effort;
  delete next.reasoning;
  delete next.thinking;
  if ("generationConfig" in next) {
    next.generationConfig = stripGeminiThinkingConfig(next.generationConfig);
  }
  if (isRecord(next.request)) {
    const request = { ...next.request };
    delete request.reasoning_effort;
    delete request.reasoning;
    delete request.thinking;
    if ("generationConfig" in request) {
      request.generationConfig = stripGeminiThinkingConfig(request.generationConfig);
    }
    next.request = request;
  }
  return next;
}
export {
  shouldStripCloudCodeThinking,
  stripCloudCodeThinkingConfig
};
