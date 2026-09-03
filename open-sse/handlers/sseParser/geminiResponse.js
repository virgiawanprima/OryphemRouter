import { normalizeOpenAICompatibleFinishReasonString } from "../../utils/omni/finishReason.js";
function stripZeroWidth(value) {
  if (typeof value === "string") return value.replace(/[\u200B-\u200D\uFEFF]/g, "");
  return value;
}
function tryParseTextualToolCall(text) {
  const normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const match = normalized.match(
    /^[\s\S]*?\[Tool call:\s*([^\]\n]+)\]\s*\nArguments:\s*([\s\S]+?)\s*$/
  );
  if (!match) return null;
  const name = match[1]?.trim();
  const rawArgs = match[2]?.trim();
  if (!name || !rawArgs) return null;
  try {
    return { name, args: stripZeroWidth(JSON.parse(rawArgs)) };
  } catch {
    return null;
  }
}
function extractGeminiMarkdownShortcut(parsed) {
  if (typeof parsed.markdown === "string") return parsed.markdown;
  const response = parsed.response;
  return typeof response?.markdown === "string" ? response.markdown : null;
}
function applyCandidatePart(part, acc) {
  if (typeof part.text !== "string" || part.thought || part.thoughtSignature) return;
  const textualToolCall = tryParseTextualToolCall(part.text);
  if (textualToolCall) {
    acc.toolCalls.push({
      id: `${textualToolCall.name}-${Date.now()}-${acc.toolCalls.length}`,
      index: acc.toolCalls.length,
      type: "function",
      function: {
        name: textualToolCall.name,
        arguments: JSON.stringify(textualToolCall.args || {})
      }
    });
  } else {
    acc.textContent += part.text;
  }
  acc.sawContent = true;
}
function applyCandidateContentParts(candidate, acc) {
  const content = candidate?.content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    applyCandidatePart(part, acc);
  }
}
function applyFinishReason(candidate, acc) {
  if (!candidate?.finishReason) return;
  acc.finishReason = normalizeOpenAICompatibleFinishReasonString(
    String(candidate.finishReason).toLowerCase()
  );
}
function applyUsageMetadata(parsed, acc) {
  const response = parsed.response;
  const um = response?.usageMetadata;
  if (!um) return;
  acc.usage = {
    prompt_tokens: um.promptTokenCount || 0,
    completion_tokens: um.candidatesTokenCount || 0,
    total_tokens: um.totalTokenCount || 0
  };
}
function applyGeminiSSEDataLine(payload, acc) {
  try {
    const parsed = JSON.parse(payload);
    const markdown = extractGeminiMarkdownShortcut(parsed);
    if (markdown) {
      acc.textContent += markdown;
      acc.sawContent = true;
    }
    const response = parsed.response;
    const candidates = response?.candidates;
    const candidate = Array.isArray(candidates) ? candidates[0] : void 0;
    applyCandidateContentParts(candidate, acc);
    applyFinishReason(candidate, acc);
    applyUsageMetadata(parsed, acc);
  } catch {
  }
}
function buildChatCompletionFromAccumulator(acc, fallbackModel) {
  const message = {
    role: "assistant",
    content: acc.textContent || null
  };
  let finishReason = acc.finishReason;
  if (acc.toolCalls.length > 0) {
    message.tool_calls = acc.toolCalls;
    finishReason = "tool_calls";
  }
  const result = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model: fallbackModel || "unknown",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason
      }
    ]
  };
  if (acc.usage) {
    result.usage = acc.usage;
  }
  return result;
}
function parseSSEToGeminiResponse(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const acc = {
    textContent: "",
    finishReason: "stop",
    usage: null,
    sawContent: false,
    toolCalls: []
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    applyGeminiSSEDataLine(payload, acc);
  }
  if (!acc.sawContent && acc.toolCalls.length === 0) return null;
  return buildChatCompletionFromAccumulator(acc, fallbackModel);
}
export {
  parseSSEToGeminiResponse
};
