// ADAPTED STUB — ported from OmniRoute open-sse/handlers/responseSanitizer.ts
// Only `isResponsesCommentaryMessageItem` is needed (by responsesCommentaryDrop.js).
// The full response sanitizer pipeline lives in OryphemRouter's own handlers; this
// minimal leaf only preserves the Responses `phase === "commentary"` detection.

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toString(value) {
  return typeof value === "string" ? value : "";
}

/**
 * True when a Responses output item is an assistant `message` in the internal
 * `commentary` phase — i.e. reasoning/scratchpad text that must never reach the
 * client.
 */
export function isResponsesCommentaryMessageItem(item) {
  const itemRecord = toRecord(item);
  if (!itemRecord) return false;
  const type = toString(itemRecord.type) || "message";
  if (type !== "message") return false;
  const role = toString(itemRecord.role) || "assistant";
  const phase = toString(itemRecord.phase);
  return role === "assistant" && phase === "commentary";
}
