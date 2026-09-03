import { restoreOpenAIToolNames } from "./omni/toolCallHelper.js";
function normalizeFinalOpenAIStreamChunk(parsed, toolNameMap) {
  let changed = false;
  if (parsed.id != null && typeof parsed.id !== "string") {
    parsed.id = String(parsed.id);
    changed = true;
  }
  if (Array.isArray(parsed.choices)) {
    for (const choice of parsed.choices) {
      const delta = choice?.delta;
      if (!Array.isArray(delta?.tool_calls)) continue;
      for (const toolCall of delta.tool_calls) {
        if (toolCall?.id != null && typeof toolCall.id !== "string") {
          toolCall.id = String(toolCall.id);
          changed = true;
        }
      }
    }
  }
  changed = restoreOpenAIToolNames(parsed, toolNameMap) || changed;
  const firstChoice = Array.isArray(parsed.choices) ? parsed.choices[0] : void 0;
  return { changed, hasFinishReason: Boolean(firstChoice?.finish_reason) };
}
export {
  normalizeFinalOpenAIStreamChunk
};
