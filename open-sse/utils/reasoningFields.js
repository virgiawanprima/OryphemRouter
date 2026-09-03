import { stripInternalReasoningPlaceholder } from "./reasoningPlaceholder.js";
function asReasoningRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : "";
}
function extractReasoningDetailsText(value) {
  const record = asReasoningRecord(value);
  if (!Array.isArray(record.reasoning_details)) return "";
  return record.reasoning_details.map((detail) => {
    const item = asReasoningRecord(detail);
    return nonEmptyString(item.text) || nonEmptyString(item.content);
  }).join("");
}
function getReadableReasoningValue(value) {
  const record = asReasoningRecord(value);
  return nonEmptyString(record.reasoning_content) || nonEmptyString(record.reasoning);
}
function getUnsupportedReasoningValue(value) {
  const record = asReasoningRecord(value);
  return nonEmptyString(record.reasoning_text) || nonEmptyString(record.thinking) || nonEmptyString(record.thought) || extractReasoningDetailsText(record);
}
function getAnyReasoningValue(value) {
  return getReadableReasoningValue(value) || getUnsupportedReasoningValue(value);
}
function hasUnsupportedReasoningSignal(value) {
  const record = asReasoningRecord(value);
  return Boolean(
    !getReadableReasoningValue(record) && (nonEmptyString(record.reasoning_text) || nonEmptyString(record.thinking) || nonEmptyString(record.thought) || Array.isArray(record.reasoning_details) && record.reasoning_details.length > 0)
  );
}
function hasAnyReasoningSignal(value) {
  const record = asReasoningRecord(value);
  return Boolean(
    getReadableReasoningValue(record) || nonEmptyString(record.reasoning_text) || nonEmptyString(record.thinking) || nonEmptyString(record.thought) || Array.isArray(record.reasoning_details) && record.reasoning_details.length > 0
  );
}
const STRIPPABLE_REASONING_FIELDS = [
  "reasoning_content",
  "reasoning",
  "reasoning_text",
  "thinking",
  "thought"
];
function stripPlaceholderFromField(target, field) {
  const value = target[field];
  if (typeof value !== "string") return false;
  const stripped = stripInternalReasoningPlaceholder(value);
  if (stripped === "") {
    delete target[field];
    return true;
  }
  if (stripped !== value) target[field] = stripped;
  return false;
}
function copyOpenAICompatibleReasoningFields(source, target) {
  if (source.reasoning_content !== void 0) target.reasoning_content = source.reasoning_content;
  if (source.reasoning !== void 0) target.reasoning = source.reasoning;
  if (source.reasoning_text !== void 0) target.reasoning_text = source.reasoning_text;
  if (source.thinking !== void 0) target.thinking = source.thinking;
  if (source.thought !== void 0) target.thought = source.thought;
  if (Array.isArray(source.reasoning_details)) target.reasoning_details = source.reasoning_details;
  if (!getReadableReasoningValue(target)) {
    const mirrored = getUnsupportedReasoningValue(source);
    if (mirrored) target.reasoning_content = mirrored;
  }
  for (const field of STRIPPABLE_REASONING_FIELDS) {
    stripPlaceholderFromField(target, field);
  }
  if (Array.isArray(target.reasoning_details)) {
    const cleaned = [];
    for (const detail of target.reasoning_details) {
      const record = asReasoningRecord(detail);
      const next = { ...record };
      const hadText = typeof next.text === "string";
      const hadContent = typeof next.content === "string";
      stripPlaceholderFromField(next, "text");
      stripPlaceholderFromField(next, "content");
      const textGone = next.text === void 0;
      const contentGone = next.content === void 0;
      if ((hadText || hadContent) && textGone && contentGone) continue;
      cleaned.push(next);
    }
    if (cleaned.length === 0) delete target.reasoning_details;
    else target.reasoning_details = cleaned;
  }
}
export {
  asReasoningRecord,
  copyOpenAICompatibleReasoningFields,
  extractReasoningDetailsText,
  getAnyReasoningValue,
  getReadableReasoningValue,
  getUnsupportedReasoningValue,
  hasAnyReasoningSignal,
  hasUnsupportedReasoningSignal
};
