const NON_ANTHROPIC_THINKING_PLACEHOLDER = "(prior reasoning summary unavailable)";
function isInternalReasoningPlaceholder(value) {
  return typeof value === "string" && value.trim() === NON_ANTHROPIC_THINKING_PLACEHOLDER;
}
function stripInternalReasoningPlaceholder(value) {
  if (!value.includes(NON_ANTHROPIC_THINKING_PLACEHOLDER)) return value;
  const stripped = value.replaceAll(NON_ANTHROPIC_THINKING_PLACEHOLDER, "");
  return stripped.trim() === "" ? "" : stripped;
}
export {
  NON_ANTHROPIC_THINKING_PLACEHOLDER,
  isInternalReasoningPlaceholder,
  stripInternalReasoningPlaceholder
};
