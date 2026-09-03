function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function normalizeMimoThinking(body) {
  const record = asRecord(body);
  if (!record) return body;
  const thinking = asRecord(record.thinking);
  const hasReasoningEffort = record.reasoning_effort !== void 0;
  const hasReasoning = record.reasoning !== void 0;
  if (!thinking && !hasReasoningEffort && !hasReasoning) return body;
  const next = { ...record };
  if (thinking) {
    next.thinking = { type: thinking.type === "disabled" ? "disabled" : "enabled" };
  }
  delete next.reasoning_effort;
  delete next.reasoning;
  return next;
}
export {
  normalizeMimoThinking
};
