import { CLAUDE_OAUTH_TOOL_PREFIX } from "../../utils/omni/claudeOauthConstants.js";
import { restoreOpenAIToolNames } from "../../utils/omni/toolCallHelper.js";
function buildClaudePassthroughToolNameMap(body) {
  if (!body || !Array.isArray(body.tools)) return null;
  const toolNameMap = /* @__PURE__ */ new Map();
  for (const tool of body.tools) {
    const toolRecord = tool;
    const toolData = toolRecord?.type === "function" && toolRecord.function && typeof toolRecord.function === "object" ? toolRecord.function : toolRecord;
    const originalName = typeof toolData?.name === "string" ? toolData.name.trim() : "";
    if (!originalName) continue;
    toolNameMap.set(`${CLAUDE_OAUTH_TOOL_PREFIX}${originalName}`, originalName);
  }
  return toolNameMap.size > 0 ? toolNameMap : null;
}
function restoreClaudePassthroughToolNames(responseBody, toolNameMap) {
  if (!toolNameMap || !Array.isArray(responseBody?.content)) return responseBody;
  let changed = false;
  const content = responseBody.content.map((block) => {
    if (block?.type !== "tool_use" || typeof block?.name !== "string") return block;
    const restoredName = toolNameMap.get(block.name) ?? block.name;
    if (restoredName === block.name) return block;
    changed = true;
    return {
      ...block,
      name: restoredName
    };
  });
  if (!changed) return responseBody;
  return {
    ...responseBody,
    content
  };
}
function mergeResponseToolNameMap(baseToolNameMap, transformedBody) {
  const transformedRecord = transformedBody && typeof transformedBody === "object" && !Array.isArray(transformedBody) ? transformedBody : null;
  const executorToolNameMap = transformedRecord?._toolNameMap instanceof Map ? transformedRecord._toolNameMap : null;
  if (!executorToolNameMap?.size) return baseToolNameMap;
  if (!baseToolNameMap?.size) return executorToolNameMap;
  const merged = new Map(baseToolNameMap);
  for (const [toolName, originalName] of executorToolNameMap.entries()) {
    merged.set(toolName, originalName);
  }
  return merged;
}
function restoreNonStreamingToolNames(responseBody, baseToolNameMap, transformedBody, restoreClaudeNames) {
  const responseToolNameMap = mergeResponseToolNameMap(baseToolNameMap, transformedBody);
  const restoredBody = restoreClaudeNames ? restoreClaudePassthroughToolNames(responseBody, responseToolNameMap) : responseBody;
  restoreOpenAIToolNames(restoredBody, responseToolNameMap);
  return [restoredBody, responseToolNameMap];
}
function normalizeOpenAIToolFinishReasons(responseBody) {
  const response = responseBody;
  if (!response?.choices) return;
  for (const choice of response.choices) {
    if (choice.message?.tool_calls?.length > 0 && choice.finish_reason !== "tool_calls") {
      choice.finish_reason = "tool_calls";
    }
  }
}
export {
  buildClaudePassthroughToolNameMap,
  mergeResponseToolNameMap,
  normalizeOpenAIToolFinishReasons,
  restoreClaudePassthroughToolNames,
  restoreNonStreamingToolNames
};
