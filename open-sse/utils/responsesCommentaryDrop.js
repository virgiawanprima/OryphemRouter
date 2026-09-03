import { isResponsesCommentaryMessageItem } from "./omni/responseSanitizer.js";
import { FORMATS } from "../translator/formats.js";
function extractEventItem(parsed) {
  return parsed.item && typeof parsed.item === "object" && !Array.isArray(parsed.item) ? parsed.item : null;
}
function extractEventItemId(parsed, eventItem) {
  if (typeof parsed.item_id === "string") return parsed.item_id;
  if (eventItem && typeof eventItem.id === "string") return eventItem.id;
  return null;
}
function extractEventOutputIndex(parsed) {
  return typeof parsed.output_index === "number" ? parsed.output_index : null;
}
function isCommentaryStart(eventType, parsed, eventItemId, eventOutputIndex, commentaryItemIds, commentaryIndexes) {
  const isAddedEvent = eventType === "response.output_item.added";
  if (!isAddedEvent || !isResponsesCommentaryMessageItem(parsed.item)) return false;
  if (eventItemId) commentaryItemIds.add(eventItemId);
  if (eventOutputIndex !== null) commentaryIndexes.add(eventOutputIndex);
  return true;
}
function isCommentaryContinuation(eventType, eventItemId, eventOutputIndex, commentaryItemIds, commentaryIndexes) {
  const belongsToCommentary = eventItemId !== null && commentaryItemIds.has(eventItemId) || eventOutputIndex !== null && commentaryIndexes.has(eventOutputIndex);
  if (!belongsToCommentary) return false;
  if (eventType === "response.output_item.done") {
    if (eventItemId) commentaryItemIds.delete(eventItemId);
    if (eventOutputIndex !== null) commentaryIndexes.delete(eventOutputIndex);
  }
  return true;
}
function shouldDropResponsesCommentaryEvent(parsed, commentaryItemIds, commentaryIndexes) {
  const eventType = parsed.type;
  const eventItem = extractEventItem(parsed);
  const eventItemId = extractEventItemId(parsed, eventItem);
  const eventOutputIndex = extractEventOutputIndex(parsed);
  return isCommentaryStart(
    eventType,
    parsed,
    eventItemId,
    eventOutputIndex,
    commentaryItemIds,
    commentaryIndexes
  ) || isCommentaryContinuation(
    eventType,
    eventItemId,
    eventOutputIndex,
    commentaryItemIds,
    commentaryIndexes
  );
}
function createTranslateCommentaryFilter(targetFormat) {
  const commentaryItemIds = /* @__PURE__ */ new Set();
  const commentaryIndexes = /* @__PURE__ */ new Set();
  const applies = targetFormat === FORMATS.OPENAI_RESPONSES;
  return (parsed) => applies && shouldDropResponsesCommentaryEvent(parsed, commentaryItemIds, commentaryIndexes);
}
export {
  createTranslateCommentaryFilter,
  shouldDropResponsesCommentaryEvent
};
