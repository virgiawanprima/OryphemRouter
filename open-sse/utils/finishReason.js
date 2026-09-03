const OPENAI_FINISH_REASONS = /* @__PURE__ */ new Set([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call"
]);
const SAFETY_FINISH_REASONS = /* @__PURE__ */ new Set([
  "safety",
  "recitation",
  "blocklist",
  "prohibited_content",
  "content_filtered",
  "policy_violation",
  "malformed_response"
]);
const ABORT_FINISH_REASONS = /* @__PURE__ */ new Set([
  "malformed_function_call",
  "unexpected_tool_call",
  "finish_reason_unspecified",
  "other",
  "language",
  "no_image"
]);
function isAbortFinishReason(value) {
  if (typeof value !== "string") return false;
  return ABORT_FINISH_REASONS.has(value.toLowerCase());
}
const MALFORMED_TOOL_CALL_FINISH_REASONS = /* @__PURE__ */ new Set([
  "malformed_function_call",
  "unexpected_tool_call"
]);
function isMalformedToolCallFinishReason(value) {
  if (typeof value !== "string") return false;
  return MALFORMED_TOOL_CALL_FINISH_REASONS.has(value.toLowerCase());
}
function normalizeOpenAICompatibleFinishReason(value) {
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase();
  if (OPENAI_FINISH_REASONS.has(normalized)) return normalized;
  if (normalized === "max_tokens") return "length";
  if (SAFETY_FINISH_REASONS.has(normalized)) return "content_filter";
  return normalized;
}
function normalizeOpenAICompatibleFinishReasonString(value, fallback = "stop") {
  const normalized = normalizeOpenAICompatibleFinishReason(value);
  return typeof normalized === "string" && normalized ? normalized : fallback;
}
export {
  isAbortFinishReason,
  isMalformedToolCallFinishReason,
  normalizeOpenAICompatibleFinishReason,
  normalizeOpenAICompatibleFinishReasonString
};
