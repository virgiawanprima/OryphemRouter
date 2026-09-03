const GEMINI_WEB_UNSUPPORTED_CONTROL_CODE = "unsupported_control_for_provider";
const SATISFIED_EFFORT_LEVELS = /* @__PURE__ */ new Set(["none", "minimal"]);
const FORCING_TOOL_CHOICE_STRINGS = /* @__PURE__ */ new Set(["required", "any"]);
const FORCING_TOOL_CHOICE_TYPES = /* @__PURE__ */ new Set(["function", "tool", "any"]);
function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}
function isForcingToolChoice(toolChoice) {
  const asString = normalizeString(toolChoice);
  if (asString) return FORCING_TOOL_CHOICE_STRINGS.has(asString);
  if (toolChoice && typeof toolChoice === "object" && !Array.isArray(toolChoice)) {
    const type = normalizeString(toolChoice.type);
    return type !== null && FORCING_TOOL_CHOICE_TYPES.has(type);
  }
  return false;
}
function requestsThinkingBudget(reasoningEffort) {
  const effort = normalizeString(reasoningEffort);
  if (effort === null) return false;
  return !SATISFIED_EFFORT_LEVELS.has(effort);
}
function checkGeminiWebUnsupportedControls(body) {
  if (!body || typeof body !== "object") return null;
  if (requestsThinkingBudget(body.reasoning_effort)) {
    return {
      param: "reasoning_effort",
      message: 'Model provider "gemini-web" does not support "reasoning_effort". It drives the gemini.google.com web UI through a typed prompt and has no thinking-budget control to set, so any effort above "minimal" would be silently ignored. Remove "reasoning_effort" (or send "none"/"minimal") or route to a reasoning-capable model.'
    };
  }
  if (isForcingToolChoice(body.tool_choice)) {
    return {
      param: "tool_choice",
      message: 'Model provider "gemini-web" cannot guarantee a forced tool call. Its tool support is prompt-emulated \u2014 the model is asked to emit a tool block and may answer with prose instead \u2014 so "tool_choice" values that require one ("required", "any", or a named function) cannot be honored. Use "auto" to keep best-effort tool calling, or route to a model with native function calling.'
    };
  }
  return null;
}
export {
  GEMINI_WEB_UNSUPPORTED_CONTROL_CODE,
  checkGeminiWebUnsupportedControls,
  isForcingToolChoice,
  requestsThinkingBudget
};
