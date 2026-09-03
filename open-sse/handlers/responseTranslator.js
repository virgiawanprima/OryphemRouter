import { FORMATS } from "../translator/formats.js";
import { log } from "../utils/log.js";
import {
  buildGeminiThoughtSignatureKey,
  storeGeminiThoughtSignature
} from "../utils/omni/geminiThoughtSignatureStore.js";
import { normalizeOpenAICompatibleFinishReasonString } from "../utils/omni/finishReason.js";
import { containsTextualToolCallMarker } from "../utils/omni/textualToolCall.js";
import { getAnyReasoningValue } from "../utils/omni/reasoningFields.js";
import {
  caseInsensitiveToolNameLookup,
  restoreOpenAIToolNames
} from "../utils/omni/toolCallHelper.js";
import { restoreClaudeToolName } from "../utils/omni/claudeCodeToolRemapper.js";
import { extractReplayableResponsesReasoningText } from "../utils/omni/reasoningInputPolicy.js";
import { sanitizeToolId } from "../utils/omni/schemaCoercion.js";
import { stripEmptyOptionalToolArgs } from "../utils/omni/pureHelpers.js";
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function toNumber(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim().length > 0 ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
function firstPositiveNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value, 0);
    if (parsed > 0) {
      return parsed;
    }
  }
  return 0;
}
function normalizeToolCallArgs(args) {
  if (typeof args !== "string") return args;
  const trimmed = args.trim();
  if (!trimmed || !(trimmed.startsWith("{") || trimmed.startsWith("["))) return args;
  try {
    return JSON.parse(trimmed);
  } catch {
    return args;
  }
}
function parseTextualToolCall(text) {
  if (typeof text !== "string") return null;
  const normalized = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const match = normalized.match(
    /^[\s\S]*?\[Tool call:\s*([^\]\n]+)\]\s*\nArguments:\s*([\s\S]+?)\s*$/
  );
  if (!match) return null;
  const name = match[1]?.trim();
  const rawArgs = match[2]?.trim();
  if (!name || !rawArgs) return null;
  try {
    let args = JSON.parse(rawArgs);
    if (typeof args === "string") {
      const trimmed = args.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        args = JSON.parse(trimmed);
      }
    }
    if (args && typeof args === "object" && !Array.isArray(args)) {
      return { name, args };
    }
  } catch {
  }
  return null;
}
function extractMessageOutputText(item) {
  if (!Array.isArray(item.content)) return "";
  let text = "";
  for (const part of item.content) {
    if (!part || typeof part !== "object") continue;
    const partObj = toRecord(part);
    if (partObj.type === "output_text" && typeof partObj.text === "string") {
      text += partObj.text;
    }
  }
  return text;
}
function findBestMessageText(output) {
  const messageItems = output.map((item) => toRecord(item)).filter((item) => item.type === "message" && Array.isArray(item.content));
  for (let i = messageItems.length - 1; i >= 0; i -= 1) {
    const text = extractMessageOutputText(messageItems[i]);
    if (text.trim().length > 0) {
      return { text, selectedMessageIndex: i, messageItems };
    }
  }
  if (messageItems.length > 0) {
    const lastIndex = messageItems.length - 1;
    return {
      text: extractMessageOutputText(messageItems[lastIndex]),
      selectedMessageIndex: lastIndex,
      messageItems
    };
  }
  return { text: "", selectedMessageIndex: -1, messageItems: [] };
}
function translateNonStreamingResponse(responseBody, targetFormat, sourceFormat, toolNameMap, toolSchemas) {
  if (targetFormat === sourceFormat) {
    if (targetFormat === FORMATS.OPENAI) {
      restoreOpenAIToolNames(responseBody, toolNameMap);
    }
    return responseBody;
  }
  let intermediateOpenAI = responseBody;
  if (targetFormat === FORMATS.OPENAI) {
    restoreOpenAIToolNames(intermediateOpenAI, toolNameMap);
  }
  if (targetFormat === FORMATS.OPENAI_RESPONSES) {
    const responseRoot = toRecord(responseBody);
    const response = responseRoot.object === "response" ? responseRoot : toRecord(responseRoot.response ?? responseRoot);
    const output = Array.isArray(response.output) ? response.output : [];
    const usage = toRecord(response.usage ?? responseRoot.usage);
    const messageSelection = findBestMessageText(output);
    let textContent = messageSelection.text;
    let replayableReasoningContent = "";
    let reasoningSummary = "";
    const toolCalls = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const itemObj = toRecord(item);
      if (itemObj.type === "message" && Array.isArray(itemObj.content)) {
        for (const part of itemObj.content) {
          if (!part || typeof part !== "object") continue;
          const partObj = toRecord(part);
          if (partObj.type === "summary_text" && typeof partObj.text === "string") {
            reasoningSummary += reasoningSummary ? `

${partObj.text}` : partObj.text;
          }
        }
      } else if (itemObj.type === "reasoning") {
        const replayable = extractReplayableResponsesReasoningText(itemObj);
        if (replayable) {
          replayableReasoningContent += replayableReasoningContent ? `

${replayable}` : replayable;
        }
        if (Array.isArray(itemObj.summary)) {
          for (const part of itemObj.summary) {
            const partObj = toRecord(part);
            if (partObj.type === "summary_text" && typeof partObj.text === "string") {
              reasoningSummary += reasoningSummary ? `

${partObj.text}` : partObj.text;
            }
          }
        }
      } else if (itemObj.type === "function_call") {
        const callId = toString(itemObj.call_id) || toString(itemObj.id) || `call_${Date.now()}_${toolCalls.length}`;
        let argsToEmit = itemObj.arguments;
        const rawName = toString(itemObj.name);
        const toolSchema = toolSchemas?.get(rawName);
        if (toolSchema) {
          argsToEmit = stripEmptyOptionalToolArgs(argsToEmit, rawName, toolSchema);
        }
        if (argsToEmit != null && typeof argsToEmit === "object" && !Array.isArray(argsToEmit)) {
          const cleaned = { ...argsToEmit };
          for (const [k, v] of Object.entries(cleaned)) {
            if (v === "" || Array.isArray(v) && v.length === 0) delete cleaned[k];
          }
          argsToEmit = cleaned;
        }
        const fnArgs = typeof argsToEmit === "string" ? argsToEmit : JSON.stringify(argsToEmit || {});
        const resolvedName = caseInsensitiveToolNameLookup(rawName, toolNameMap) ?? rawName;
        toolCalls.push({
          id: callId,
          type: "function",
          function: {
            name: resolvedName,
            arguments: fnArgs
          }
        });
      }
    }
    const message = { role: "assistant" };
    if (textContent) {
      message.content = textContent;
    }
    if (replayableReasoningContent) {
      message.reasoning_content = replayableReasoningContent;
    }
    if (reasoningSummary) {
      message.reasoning_summary = [{ type: "summary_text", text: reasoningSummary }];
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }
    if (message.content === void 0) {
      message.content = "";
    }
    if (process.env.DEBUG_RESPONSES_SSE_TO_JSON === "true") {
      log.info(
        "RESPONSES_SSE",
        `${output.length} output items, ${messageSelection.messageItems.length} message items`
      );
      messageSelection.messageItems.forEach((item, idx) => {
        const textLen = extractMessageOutputText(item).length;
        log.info("RESPONSES_SSE", `  [${idx}] text length: ${textLen}`);
      });
      log.info("RESPONSES_SSE", `  \u2192 Selected message index: ${messageSelection.selectedMessageIndex}`);
      log.info("RESPONSES_SSE", `  \u2192 Final text content length: ${textContent.length}`);
    }
    const createdAt = toNumber(response.created_at, Math.floor(Date.now() / 1e3));
    const model = toString(response.model || responseRoot.model, "openai-responses");
    const finishReason = toolCalls.length > 0 ? "tool_calls" : "stop";
    const result = {
      id: `chatcmpl-${toString(response.id, String(Date.now()))}`,
      object: "chat.completion",
      created: createdAt,
      model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason
        }
      ]
    };
    if (Object.keys(usage).length > 0) {
      const inputTokens = toNumber(usage.input_tokens, 0);
      const outputTokens = toNumber(usage.output_tokens, 0);
      const inputTokensDetails = toRecord(usage.input_tokens_details);
      const outputTokensDetails = toRecord(usage.output_tokens_details);
      const promptTokensDetails = toRecord(usage.prompt_tokens_details);
      const completionTokensDetails = toRecord(usage.completion_tokens_details);
      const cachedInputTokens = firstPositiveNumber(
        inputTokensDetails.cached_tokens,
        promptTokensDetails.cached_tokens,
        usage.cache_read_input_tokens
      );
      const cacheCreationInputTokens = firstPositiveNumber(
        inputTokensDetails.cache_creation_tokens,
        promptTokensDetails.cache_creation_tokens,
        usage.cache_creation_input_tokens
      );
      const reasoningTokens = firstPositiveNumber(
        outputTokensDetails.reasoning_tokens,
        completionTokensDetails.reasoning_tokens,
        usage.reasoning_tokens
      );
      result.usage = {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      };
      if (reasoningTokens > 0) {
        result.usage.completion_tokens_details = {
          reasoning_tokens: reasoningTokens
        };
      }
      if (cachedInputTokens > 0 || cacheCreationInputTokens > 0) {
        result.usage.prompt_tokens_details = {};
        const promptDetails = result.usage.prompt_tokens_details;
        if (cachedInputTokens > 0) {
          promptDetails.cached_tokens = cachedInputTokens;
        }
        if (cacheCreationInputTokens > 0) {
          promptDetails.cache_creation_tokens = cacheCreationInputTokens;
        }
      }
    }
    intermediateOpenAI = result;
  } else if (targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY) {
    const root = toRecord(responseBody);
    const response = toRecord(root.response ?? root);
    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    const usage = toRecord(response.usageMetadata ?? root.usageMetadata);
    const promptFeedback = toRecord(response.promptFeedback ?? root.promptFeedback);
    if (candidates.length > 0 || Object.keys(promptFeedback).length > 0) {
      const createdMs = Date.parse(toString(response.createTime));
      const created = Number.isFinite(createdMs) ? Math.floor(createdMs / 1e3) : Math.floor(Date.now() / 1e3);
      const choices = candidates.length > 0 ? candidates.map((candidateValue, index) => {
        const candidate = toRecord(candidateValue);
        const content = toRecord(candidate.content);
        let textContent = "";
        const contentParts = [];
        const toolCalls = [];
        let reasoningContent = "";
        let pendingThoughtSignature = "";
        if (Array.isArray(content.parts)) {
          for (const part of content.parts) {
            const partObj = toRecord(part);
            if (partObj.thought === true && typeof partObj.text === "string") {
              reasoningContent += reasoningContent ? `

${partObj.text}` : partObj.text;
              continue;
            }
            const partThoughtSig = toString(
              partObj.thoughtSignature ?? partObj.thought_signature
            );
            if (partThoughtSig) {
              pendingThoughtSignature = partThoughtSig;
            }
            if (typeof partObj.text === "string") {
              const textualToolCall = parseTextualToolCall(partObj.text);
              if (textualToolCall) {
                const toolCallId = `call_${toString(textualToolCall.name, "unknown")}_${Date.now()}_${toolCalls.length}`;
                toolCalls.push({
                  id: toolCallId,
                  type: "function",
                  function: {
                    name: textualToolCall.name,
                    arguments: JSON.stringify(textualToolCall.args || {})
                  }
                });
              } else if (!containsTextualToolCallMarker(partObj.text)) {
                textContent += partObj.text;
                contentParts.push({ type: "text", text: partObj.text });
              }
            }
            const inlineData = toRecord(partObj.inlineData ?? partObj.inline_data);
            if (typeof inlineData.data === "string" && inlineData.data.length > 0) {
              const mimeType = toString(
                inlineData.mimeType ?? inlineData.mime_type,
                "image/png"
              );
              contentParts.push({
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${inlineData.data}` }
              });
            }
            if (partObj.functionCall) {
              const fn = toRecord(partObj.functionCall);
              const rawName = toString(fn.name);
              const restoredName = caseInsensitiveToolNameLookup(rawName, toolNameMap) ?? rawName;
              const nativeId = toString(fn.id);
              const toolCallId = nativeId.length > 0 ? nativeId : `call_${toString(restoredName, "unknown")}_${Date.now()}_${toolCalls.length}`;
              const sig = partThoughtSig || pendingThoughtSignature;
              if (sig) {
                const sigKey = buildGeminiThoughtSignatureKey(null, toolCallId);
                storeGeminiThoughtSignature(sigKey, sig);
              }
              toolCalls.push({
                id: toolCallId,
                type: "function",
                function: {
                  name: restoredName,
                  arguments: JSON.stringify(normalizeToolCallArgs(fn.args || {}))
                }
              });
            }
          }
        }
        const message = { role: "assistant" };
        if (contentParts.length === 1 && contentParts[0].type === "text") {
          message.content = contentParts[0].text;
        } else if (contentParts.length > 0) {
          message.content = contentParts;
        } else if (textContent) {
          message.content = textContent;
        }
        if (reasoningContent) {
          message.reasoning_content = reasoningContent;
        }
        if (toolCalls.length > 0) {
          message.tool_calls = toolCalls;
        }
        if (!message.content && !message.tool_calls) {
          message.content = "";
        }
        let finishReason = normalizeOpenAICompatibleFinishReasonString(
          toString(candidate.finishReason, "stop")
        );
        if (finishReason === "stop" && toolCalls.length > 0) {
          finishReason = "tool_calls";
        }
        return {
          index,
          message,
          finish_reason: finishReason
        };
      }) : [
        {
          index: 0,
          message: { role: "assistant", content: "" },
          finish_reason: "content_filter"
        }
      ];
      const result = {
        id: `chatcmpl-${toString(response.responseId, String(Date.now()))}`,
        object: "chat.completion",
        created,
        model: toString(response.modelVersion, "gemini"),
        choices
      };
      if (Object.keys(usage).length > 0) {
        const promptTokens = toNumber(usage.promptTokenCount, 0);
        const reasoningTokens = toNumber(usage.thoughtsTokenCount, 0);
        const completionTokens = toNumber(usage.candidatesTokenCount, 0) + reasoningTokens;
        result.usage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: toNumber(usage.totalTokenCount, 0)
        };
        if (reasoningTokens > 0) {
          result.usage.completion_tokens_details = {
            reasoning_tokens: reasoningTokens
          };
        }
        if (toNumber(usage.cachedContentTokenCount, 0) > 0) {
          result.usage.prompt_tokens_details = {
            cached_tokens: toNumber(usage.cachedContentTokenCount, 0)
          };
        }
      }
      intermediateOpenAI = result;
    }
  } else if (targetFormat === FORMATS.CLAUDE) {
    const root = toRecord(responseBody);
    const contentBlocks = Array.isArray(root.content) ? root.content : [];
    if (contentBlocks.length > 0) {
      let textContent = "";
      let thinkingContent = "";
      const toolCalls = [];
      for (const block of contentBlocks) {
        const blockObj = toRecord(block);
        if (blockObj.type === "text") {
          textContent += toString(blockObj.text);
        } else if (blockObj.type === "thinking") {
          thinkingContent += toString(blockObj.thinking);
        } else if (blockObj.type === "tool_use") {
          const rawName = toString(blockObj.name);
          const strippedName = caseInsensitiveToolNameLookup(rawName, toolNameMap) ?? rawName;
          toolCalls.push({
            id: toString(blockObj.id, `call_${Date.now()}_${toolCalls.length}`),
            type: "function",
            function: {
              name: strippedName,
              arguments: JSON.stringify(blockObj.input || {})
            }
          });
        }
      }
      if (textContent.length === 0 && process.env.DEBUG_CLAUDE_NONSTREAM === "true") {
        log.info(
          "CLAUDE_NONSTREAM",
          `${contentBlocks.length} content block(s), empty textContent (thinking=${thinkingContent.length}, toolCalls=${toolCalls.length}); content-less-but-valid body preserved (not empty_choices)`
        );
      }
      const message = { role: "assistant" };
      if (textContent) {
        message.content = textContent;
      }
      if (thinkingContent) {
        message.reasoning_content = thinkingContent;
      }
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      if (message.content === void 0) {
        message.content = "";
      }
      let finishReason = toString(root.stop_reason, "stop");
      if (finishReason === "end_turn") finishReason = "stop";
      if (finishReason === "tool_use") finishReason = "tool_calls";
      const result = {
        id: `chatcmpl-${toString(root.id, String(Date.now()))}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1e3),
        model: toString(root.model, "claude"),
        choices: [
          {
            index: 0,
            message,
            finish_reason: finishReason
          }
        ]
      };
      const usage = toRecord(root.usage);
      if (Object.keys(usage).length > 0) {
        const cachedTokens = toNumber(usage.cache_read_input_tokens, 0);
        const cacheCreationTokens = toNumber(usage.cache_creation_input_tokens, 0);
        const promptTokens = toNumber(usage.input_tokens, 0) + cachedTokens;
        const completionTokens = toNumber(usage.output_tokens, 0);
        const reasoningTokens = firstPositiveNumber(
          toRecord(usage.output_tokens_details).thinking_tokens,
          toRecord(usage.completion_tokens_details).reasoning_tokens,
          usage.reasoning_tokens
        );
        const usageOut = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        };
        if (reasoningTokens > 0) {
          usageOut.reasoning_tokens = reasoningTokens;
          usageOut.completion_tokens_details = { reasoning_tokens: reasoningTokens };
        }
        if (cachedTokens > 0 || cacheCreationTokens > 0) {
          const details = {};
          if (cachedTokens > 0) details.cached_tokens = cachedTokens;
          if (cacheCreationTokens > 0) details.cache_creation_tokens = cacheCreationTokens;
          usageOut.prompt_tokens_details = details;
        }
        result.usage = usageOut;
      }
      intermediateOpenAI = result;
    }
  }
  if (sourceFormat === FORMATS.CLAUDE && sourceFormat !== targetFormat) {
    return convertOpenAINonStreamingToClaude(toRecord(intermediateOpenAI), toolNameMap ?? null);
  }
  if ((sourceFormat === FORMATS.GEMINI || sourceFormat === FORMATS.ANTIGRAVITY) && sourceFormat !== targetFormat) {
    return convertOpenAINonStreamingToGeminiFamily(toRecord(intermediateOpenAI));
  }
  return intermediateOpenAI;
}
function resolveReasoningText(messageObj) {
  return getAnyReasoningValue(messageObj);
}
function convertOpenAINonStreamingToClaude(openaiResponse, toolNameMap) {
  const choices = openaiResponse.choices;
  const isChoicesArray = Array.isArray(choices);
  if (!isChoicesArray && openaiResponse.object !== "chat.completion") {
    return openaiResponse;
  }
  const choice = isChoicesArray ? choices[0] : null;
  const choiceObj = choice ? toRecord(choice) : {};
  const messageObj = choiceObj.message ? toRecord(choiceObj.message) : {};
  const content = [];
  let hasTextOrReasoning = false;
  const reasoningText = resolveReasoningText(messageObj);
  if (reasoningText) {
    hasTextOrReasoning = true;
    content.push({
      type: "thinking",
      thinking: reasoningText
    });
  }
  const hasToolCalls = Array.isArray(messageObj.tool_calls) && messageObj.tool_calls.length > 0;
  if (messageObj.content !== void 0 && messageObj.content !== null) {
    hasTextOrReasoning = true;
    const resolvedText = toString(messageObj.content);
    content.push({
      type: "text",
      text: resolvedText === "" ? "(empty response)" : resolvedText
    });
  } else if (!hasTextOrReasoning) {
    content.push({
      type: "text",
      text: "(empty response)"
    });
  }
  if (Array.isArray(messageObj.tool_calls)) {
    for (const tool of messageObj.tool_calls) {
      const toolObj = toRecord(tool);
      const fn = toRecord(toolObj.function);
      const rawId = toString(toolObj.id, `call_${Date.now()}`);
      content.push({
        type: "tool_use",
        id: sanitizeToolId(rawId),
        name: restoreClaudeToolName(toString(fn.name), toolNameMap ?? null),
        input: typeof fn.arguments === "string" ? JSON.parse(fn.arguments || "{}") : fn.arguments || {}
      });
    }
  }
  let stopReason = toString(choiceObj.finish_reason, "end_turn");
  if (stopReason === "stop") stopReason = "end_turn";
  if (stopReason === "tool_calls") stopReason = "tool_use";
  const usageSrc = toRecord(openaiResponse.usage);
  const promptTokens = toNumber(usageSrc.prompt_tokens, 0);
  const outputTokens = toNumber(usageSrc.completion_tokens, 0);
  const promptDetails = toRecord(usageSrc.prompt_tokens_details);
  const cachedTokens = toNumber(promptDetails.cached_tokens, 0);
  const cacheCreationTokens = toNumber(promptDetails.cache_creation_tokens, 0);
  const inputTokens = promptTokens - cachedTokens - cacheCreationTokens;
  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens
  };
  if (cachedTokens > 0) {
    usage.cache_read_input_tokens = cachedTokens;
  }
  if (cacheCreationTokens > 0) {
    usage.cache_creation_input_tokens = cacheCreationTokens;
  }
  const claudeResponse = {
    id: toString(openaiResponse.id, `msg_${Date.now()}`),
    type: "message",
    role: "assistant",
    model: toString(openaiResponse.model, "claude"),
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage
  };
  return claudeResponse;
}
const OPENAI_TO_GEMINI_FINISH_REASON = {
  stop: "STOP",
  length: "MAX_TOKENS",
  tool_calls: "STOP",
  content_filter: "SAFETY"
};
function parseFunctionCallArgs(args) {
  if (typeof args !== "string") return toRecord(args);
  try {
    return toRecord(JSON.parse(args || "{}"));
  } catch {
    return {};
  }
}
function convertOpenAINonStreamingToGeminiFamily(openaiResponse) {
  const choices = openaiResponse.choices;
  const isChoicesArray = Array.isArray(choices);
  if (!isChoicesArray && openaiResponse.object !== "chat.completion") {
    return openaiResponse;
  }
  const choice = isChoicesArray ? toRecord(choices[0]) : {};
  const messageObj = toRecord(choice.message);
  const parts = [];
  const reasoningText = resolveReasoningText(messageObj);
  if (reasoningText) {
    parts.push({ text: reasoningText, thought: true });
  }
  if (typeof messageObj.content === "string" && messageObj.content.length > 0) {
    parts.push({ text: messageObj.content });
  }
  const toolCalls = Array.isArray(messageObj.tool_calls) ? messageObj.tool_calls : [];
  for (const toolCall of toolCalls) {
    const toolObj = toRecord(toolCall);
    const fn = toRecord(toolObj.function);
    parts.push({
      functionCall: {
        name: toString(fn.name),
        args: parseFunctionCallArgs(fn.arguments)
      }
    });
  }
  if (parts.length === 0) parts.push({ text: "" });
  const finishReason = OPENAI_TO_GEMINI_FINISH_REASON[toString(choice.finish_reason, "stop")] ?? "STOP";
  const usageSrc = toRecord(openaiResponse.usage);
  const promptTokens = toNumber(usageSrc.prompt_tokens, 0);
  const completionTokens = toNumber(usageSrc.completion_tokens, 0);
  const geminiResponse = {
    response: {
      candidates: [
        {
          content: { role: "model", parts },
          finishReason,
          index: 0
        }
      ],
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: completionTokens,
        totalTokenCount: toNumber(usageSrc.total_tokens, promptTokens + completionTokens)
      },
      modelVersion: toString(openaiResponse.model, "unknown"),
      responseId: toString(openaiResponse.id, `resp_${Date.now()}`)
    }
  };
  return geminiResponse;
}
export {
  translateNonStreamingResponse
};
