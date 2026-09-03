import { appendBoundedText } from "./omni/streamHelpers.js";
function collectClaudeDelta(delta, state) {
  const record = delta && typeof delta === "object" && !Array.isArray(delta) ? delta : {};
  const text = record.text;
  const thinking = record.thinking;
  let contentLength = 0;
  if (typeof text === "string" && text) {
    contentLength += text.length;
    if (state?.accumulatedContent !== void 0)
      state.accumulatedContent = appendBoundedText(state.accumulatedContent, text);
  }
  if (typeof thinking === "string" && thinking) {
    contentLength += thinking.length;
    if (state?.accumulatedReasoning !== void 0)
      state.accumulatedReasoning = appendBoundedText(state.accumulatedReasoning, thinking);
  }
  return { contentLength, hasText: typeof text === "string" };
}
export {
  collectClaudeDelta
};
