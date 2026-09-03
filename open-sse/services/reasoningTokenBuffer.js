import {
  getExplicitModelOutputCap,
  getResolvedModelCapabilities
} from "../utils/omni/modelCapabilitiesFull.js";
const REASONING_BUFFER_MIN_TRIGGER = 256;
function toPositiveInteger(value) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : null;
  if (numericValue === null || !Number.isFinite(numericValue)) return null;
  const normalized = Math.floor(numericValue);
  return normalized > 0 ? normalized : null;
}
function resolveReasoningBufferedMaxTokens(modelStr, currentMaxTokens, options = {}) {
  if (options.enabled === false) return null;
  const current = toPositiveInteger(currentMaxTokens);
  if (current === null) return null;
  const capabilities = getResolvedModelCapabilities(modelStr);
  if (capabilities.supportsThinking !== true) return null;
  const maxOutputTokens = toPositiveInteger(getExplicitModelOutputCap(modelStr));
  if (maxOutputTokens === null) return null;
  if (current > maxOutputTokens) return maxOutputTokens;
  if (current < REASONING_BUFFER_MIN_TRIGGER) return current;
  return current;
}
function isTinyBudgetReasoningProbe(opts) {
  const body = opts.body ?? {};
  const maxTokens = toPositiveInteger(body.max_tokens ?? body.max_completion_tokens);
  if (maxTokens === null || maxTokens >= REASONING_BUFFER_MIN_TRIGGER) return false;
  const capabilities = getResolvedModelCapabilities(opts.model);
  return capabilities.supportsThinking === true;
}
const EMPTY_CONTENT_FAILURE_RE = /empty(\s+response)?\s+content|no\s+(usable\s+)?content|reasoning\s+consumed/i;
function isEmptyContentUpstreamFailure(statusCode, message) {
  if (!Number.isFinite(statusCode) || statusCode < 500 || statusCode >= 600) return false;
  return EMPTY_CONTENT_FAILURE_RE.test(String(message || ""));
}
function buildReasoningProbeTruncatedResponse(opts) {
  const maxTokens = opts.maxTokens ?? 1;
  const body = {
    id: `chatcmpl-${opts.requestId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model: opts.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "" },
        finish_reason: "length"
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: maxTokens,
      total_tokens: maxTokens
    }
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
export {
  REASONING_BUFFER_MIN_TRIGGER,
  buildReasoningProbeTruncatedResponse,
  isEmptyContentUpstreamFailure,
  isTinyBudgetReasoningProbe,
  resolveReasoningBufferedMaxTokens,
  toPositiveInteger
};
