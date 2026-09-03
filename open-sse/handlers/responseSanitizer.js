import {
  copyOpenAICompatibleReasoningFields,
  getReadableReasoningValue
} from "../utils/omni/reasoningFields.js";
import { stripInternalReasoningPlaceholder } from "../utils/omni/reasoningPlaceholder.js";
import { normalizeOpenAICompatibleFinishReason } from "../utils/omni/finishReason.js";
import {
  collapseExcessiveNewlines,
  extractThinkingFromContent
} from "./responseSanitizer/reasoning.js";
import {
  applyCacheHitTokensToUsage
} from "./responseSanitizer/cacheHitTokens.js";
import {
  extractThinkingFromContent as extractThinkingFromContent2,
  shouldParseTextualReasoningTags
} from "./responseSanitizer/reasoning.js";
const ALLOWED_USAGE_FIELDS = /* @__PURE__ */ new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "cached_tokens",
  "prompt_tokens_details",
  "completion_tokens_details",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  // Keep through sanitize → applyClientUsageBuffer so heuristic web usage is
  // not inflated by the default USAGE_TOKEN_BUFFER (2000).
  "estimated"
]);
const ALLOWED_RESPONSES_USAGE_FIELDS = /* @__PURE__ */ new Set([
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "input_tokens_details",
  "output_tokens_details",
  "estimated",
  "cost_in_usd_ticks",
  "server_side_tool_usage_details",
  "server_side_tool_usage"
]);
const RESPONSES_EXTRA_TOP_LEVEL_FIELDS = [
  "server_side_tool_usage_details",
  "server_side_tool_usage",
  "cost_in_usd_ticks"
];
const OMIT_STREAMING_CHUNK_MARKER = "__omniroute_omit_streaming_chunk";
function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
function toString(value) {
  return typeof value === "string" ? value : void 0;
}
function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function deleteOpenAICompatibleReasoningFields(record) {
  delete record.reasoning_content;
  delete record.reasoning;
  delete record.reasoning_text;
  delete record.reasoning_details;
}
function stripZeroWidthText(value) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "");
}
function stripZeroWidthToolArgumentJson(value) {
  return stripZeroWidthText(typeof value === "string" ? value : JSON.stringify(value || {}));
}
function stripZeroWidthFunctionArguments(functionCall) {
  const fn = toRecord(functionCall);
  if (!fn || typeof fn.arguments !== "string") return functionCall;
  const stripped = stripZeroWidthText(fn.arguments);
  if (stripped === fn.arguments) return functionCall;
  return { ...fn, arguments: stripped };
}
function stripZeroWidthToolCallArguments(toolCall) {
  const tc = toRecord(toolCall);
  if (!tc) return toolCall;
  const fn = stripZeroWidthFunctionArguments(tc.function);
  return fn === tc.function ? toolCall : { ...tc, function: fn };
}
function stripZeroWidthValue(value) {
  if (typeof value === "string") return stripZeroWidthText(value);
  if (Array.isArray(value)) return value.map((item) => stripZeroWidthValue(item));
  const record = toRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, stripZeroWidthValue(item)])
    );
  }
  return value;
}
function findBalancedJsonEnd(text, startIndex) {
  if (startIndex < 0 || startIndex >= text.length || text[startIndex] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function stripInternalToolEnvelopeText(content) {
  let sanitized = stripZeroWidthText(content);
  const markerRegex = /to=(?:functions\.[A-Za-z0-9_.-]+|multi_tool_use\.[A-Za-z0-9_.-]+|[A-Za-z_][A-Za-z0-9_]*)/g;
  while (true) {
    const match = markerRegex.exec(sanitized);
    if (!match || match.index < 0) break;
    const searchWindowEnd = Math.min(sanitized.length, match.index + 1200);
    const jsonStart = sanitized.indexOf("{", match.index);
    if (jsonStart < 0 || jsonStart >= searchWindowEnd) {
      sanitized = `${sanitized.slice(0, match.index)}${sanitized.slice(match.index + match[0].length)}`;
      markerRegex.lastIndex = 0;
      continue;
    }
    const jsonEnd = findBalancedJsonEnd(sanitized, jsonStart);
    if (jsonEnd < 0) {
      sanitized = sanitized.slice(0, match.index);
      break;
    }
    const prefix = sanitized.slice(0, match.index).replace(/[ \t]+$/g, "");
    const suffix = sanitized.slice(jsonEnd + 1).replace(/^[ \t]+/g, "");
    sanitized = `${prefix}${suffix}`;
    markerRegex.lastIndex = 0;
  }
  return sanitized.replace(/\n{3,}/g, "\n\n").trim();
}
function parseTextualToolCallContent(content) {
  if (typeof content !== "string") return null;
  const normalized = stripInternalToolEnvelopeText(content);
  const toolCallIndex = normalized.lastIndexOf("[Tool call:");
  if (toolCallIndex < 0) return null;
  const candidate = normalized.slice(toolCallIndex);
  const headerMatch = candidate.match(/^\[Tool call:\s*([^\]\n]+)\]\s*\nArguments:\s*/);
  if (!headerMatch) return null;
  const name = headerMatch[1]?.trim();
  const rawArgs = candidate.slice(headerMatch[0].length).trim();
  if (!name || !rawArgs) return null;
  const decoders = [
    (value) => value,
    (value) => {
      if (value.startsWith('"') && value.endsWith('"')) {
        const decoded = JSON.parse(value);
        return typeof decoded === "string" ? decoded : value;
      }
      return value;
    }
  ];
  for (const decode of decoders) {
    try {
      const decoded = decode(rawArgs);
      return { name, args: stripZeroWidthValue(JSON.parse(decoded)) };
    } catch {
    }
  }
  return null;
}
const TEXTUAL_TOOL_CALL_HEADER = /\[Tool call:[^\]\n]+\]\s*\nArguments:/;
function containsTextualToolCallContent(content) {
  return typeof content === "string" && TEXTUAL_TOOL_CALL_HEADER.test(stripInternalToolEnvelopeText(content));
}
function sanitizeOpenAIResponse(body, options = {}) {
  const bodyRecord = toRecord(body);
  if (!bodyRecord) return body;
  const stripReasoning = options.stripReasoning === true;
  const parseTextualReasoningTags = options.parseTextualReasoningTags === true;
  const sanitized = {};
  sanitized.id = normalizeResponseId(bodyRecord.id);
  sanitized.object = toString(bodyRecord.object) || "chat.completion";
  sanitized.created = toNumber(bodyRecord.created) ?? Math.floor(Date.now() / 1e3);
  sanitized.model = toString(bodyRecord.model) || "unknown";
  if (Array.isArray(bodyRecord.choices)) {
    sanitized.choices = bodyRecord.choices.map((choice, idx) => {
      const sanitizedChoice = sanitizeChoice(choice, idx, { parseTextualReasoningTags });
      const message = toRecord(sanitizedChoice.message);
      if (message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && sanitizedChoice.finish_reason !== "tool_calls") {
        sanitizedChoice.finish_reason = "tool_calls";
      }
      if (stripReasoning && message) {
        deleteOpenAICompatibleReasoningFields(message);
      }
      return sanitizedChoice;
    });
  } else {
    sanitized.choices = [];
  }
  if (bodyRecord.usage !== void 0) {
    sanitized.usage = sanitizeUsage(bodyRecord.usage);
  }
  if (bodyRecord.system_fingerprint) {
    sanitized.system_fingerprint = bodyRecord.system_fingerprint;
  }
  return sanitized;
}
function sanitizeResponsesApiResponse(body) {
  const bodyRecord = toRecord(body);
  if (!bodyRecord) return body;
  if (Array.isArray(bodyRecord.choices)) {
    return convertOpenAIResponseToResponses(bodyRecord);
  }
  const responseRoot = bodyRecord.object === "response" ? bodyRecord : toRecord(bodyRecord.response ?? bodyRecord) || bodyRecord;
  const sanitized = {
    id: normalizeResponsesId(responseRoot.id),
    object: "response",
    created_at: toNumber(responseRoot.created_at) ?? toNumber(responseRoot.created) ?? Math.floor(Date.now() / 1e3),
    model: toString(responseRoot.model) || "unknown",
    status: toString(responseRoot.status) || "completed",
    background: typeof responseRoot.background === "boolean" ? responseRoot.background : false,
    error: responseRoot.error ?? null
  };
  const output = sanitizeResponsesOutput(responseRoot.output);
  if (output.length === 0 && typeof responseRoot.output_text === "string" && responseRoot.output_text.trim().length > 0) {
    output.push({
      id: "msg_0",
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: responseRoot.output_text.trim() }]
    });
  }
  sanitized.output = output;
  const outputText = extractResponsesOutputText(output);
  if (outputText.length > 0) {
    sanitized.output_text = outputText;
  }
  if (responseRoot.usage !== void 0) {
    sanitized.usage = sanitizeResponsesUsage(responseRoot.usage);
  }
  for (const key of RESPONSES_EXTRA_TOP_LEVEL_FIELDS) {
    if (responseRoot[key] !== void 0) sanitized[key] = responseRoot[key];
  }
  return sanitized;
}
function sanitizeChoice(choice, defaultIndex, options = {}) {
  const choiceRecord = toRecord(choice);
  const sanitized = {
    index: defaultIndex,
    finish_reason: null
  };
  if (choiceRecord?.index !== void 0) {
    sanitized.index = choiceRecord.index;
  }
  if (choiceRecord?.finish_reason !== void 0) {
    sanitized.finish_reason = normalizeOpenAICompatibleFinishReason(choiceRecord.finish_reason);
  }
  if (choiceRecord?.message !== void 0) {
    sanitized.message = sanitizeMessage(choiceRecord.message, options);
  }
  if (choiceRecord?.delta !== void 0) {
    sanitized.delta = sanitizeMessage(choiceRecord.delta, options);
  }
  if (choiceRecord?.logprobs !== void 0) {
    sanitized.logprobs = choiceRecord.logprobs;
  }
  return sanitized;
}
function sanitizeMessageContent(msgRecord, options = {}) {
  if (typeof msgRecord.content === "string") {
    const strippedContent = stripInternalReasoningPlaceholder(
      stripInternalToolEnvelopeText(msgRecord.content)
    );
    const nativeReasoning = getReadableReasoningValue(msgRecord);
    const { content, thinking } = options.parseTextualReasoningTags === true && !nativeReasoning ? extractThinkingFromContent(strippedContent) : { content: strippedContent, thinking: null };
    const sanitized = { content: collapseExcessiveNewlines(content) };
    if (thinking) sanitized.reasoning_content = thinking;
    return sanitized;
  }
  return msgRecord.content !== void 0 ? { content: msgRecord.content } : {};
}
function applyTextualToolCallSanitization(sanitized, msgRecord) {
  const textualToolCall = parseTextualToolCallContent(sanitized.content);
  if (textualToolCall && !msgRecord.tool_calls) {
    sanitized.content = null;
    sanitized.tool_calls = [
      {
        id: `call_${Date.now()}_0`,
        type: "function",
        function: {
          name: textualToolCall.name,
          arguments: JSON.stringify(textualToolCall.args || {})
        }
      }
    ];
  } else if (containsTextualToolCallContent(sanitized.content) && !msgRecord.tool_calls) {
    sanitized.content = null;
  }
}
function sanitizeMessage(msg, options = {}) {
  const msgRecord = toRecord(msg);
  if (!msgRecord) return msg;
  const sanitized = {};
  if (msgRecord.role) sanitized.role = msgRecord.role;
  if (msgRecord.refusal !== void 0) sanitized.refusal = msgRecord.refusal;
  Object.assign(sanitized, sanitizeMessageContent(msgRecord, options));
  copyOpenAICompatibleReasoningFields(msgRecord, sanitized);
  applyTextualToolCallSanitization(sanitized, msgRecord);
  if (msgRecord.tool_calls) {
    sanitized.tool_calls = Array.isArray(msgRecord.tool_calls) ? msgRecord.tool_calls.map((toolCall) => stripZeroWidthToolCallArguments(toolCall)) : msgRecord.tool_calls;
  }
  if (msgRecord.function_call) {
    sanitized.function_call = stripZeroWidthFunctionArguments(msgRecord.function_call);
  }
  return sanitized;
}
function sanitizeUsage(usage) {
  const usageRecord = toRecord(usage);
  if (!usageRecord) return usage;
  const sanitized = {};
  if (usageRecord.input_tokens !== void 0 && usageRecord.prompt_tokens === void 0) {
    usageRecord.prompt_tokens = usageRecord.input_tokens;
  }
  if (usageRecord.output_tokens !== void 0 && usageRecord.completion_tokens === void 0) {
    usageRecord.completion_tokens = usageRecord.output_tokens;
  }
  for (const key of ALLOWED_USAGE_FIELDS) {
    if (usageRecord[key] !== void 0) {
      sanitized[key] = usageRecord[key];
    }
  }
  applyCacheHitTokensToUsage(usageRecord, sanitized);
  const promptTokens = toNumber(sanitized.prompt_tokens) ?? 0;
  const completionTokens = toNumber(sanitized.completion_tokens) ?? 0;
  const totalTokens = toNumber(sanitized.total_tokens) ?? promptTokens + completionTokens;
  sanitized.prompt_tokens = promptTokens;
  sanitized.completion_tokens = completionTokens;
  sanitized.total_tokens = totalTokens;
  return sanitized;
}
function sanitizeResponsesUsage(usage) {
  const usageRecord = toRecord(usage);
  if (!usageRecord) return usage;
  const normalized = { ...usageRecord };
  if (normalized.prompt_tokens !== void 0 && normalized.input_tokens === void 0) {
    normalized.input_tokens = normalized.prompt_tokens;
  }
  if (normalized.completion_tokens !== void 0 && normalized.output_tokens === void 0) {
    normalized.output_tokens = normalized.completion_tokens;
  }
  if (normalized.prompt_tokens_details !== void 0 && normalized.input_tokens_details === void 0) {
    normalized.input_tokens_details = normalized.prompt_tokens_details;
  }
  if (normalized.completion_tokens_details !== void 0 && normalized.output_tokens_details === void 0) {
    normalized.output_tokens_details = normalized.completion_tokens_details;
  }
  if (normalized.prompt_cache_hit_tokens !== void 0 && !(toRecord(normalized.input_tokens_details) ?? {}).cached_tokens) {
    normalized.input_tokens_details = {
      ...normalized.input_tokens_details || {},
      cached_tokens: normalized.prompt_cache_hit_tokens
    };
  }
  if (normalized.cache_read_input_tokens !== void 0 && normalized.cache_read_input_tokens !== 0 && !(toRecord(normalized.input_tokens_details) ?? {}).cached_tokens) {
    normalized.input_tokens_details = {
      ...normalized.input_tokens_details || {},
      cached_tokens: normalized.cache_read_input_tokens
    };
  }
  const inputDetails = toRecord(normalized.input_tokens_details) || {};
  const cachedTokens = normalized.cached_tokens ?? normalized.cache_read_input_tokens;
  if (cachedTokens !== void 0 && inputDetails.cached_tokens === void 0) {
    inputDetails.cached_tokens = cachedTokens;
  }
  if (normalized.cache_creation_input_tokens !== void 0 && inputDetails.cache_creation_tokens === void 0) {
    inputDetails.cache_creation_tokens = normalized.cache_creation_input_tokens;
  }
  if (Object.keys(inputDetails).length > 0) {
    normalized.input_tokens_details = inputDetails;
  }
  const outputDetails = toRecord(normalized.output_tokens_details) || {};
  if (normalized.reasoning_tokens !== void 0 && outputDetails.reasoning_tokens === void 0) {
    outputDetails.reasoning_tokens = normalized.reasoning_tokens;
  }
  if (Object.keys(outputDetails).length > 0) {
    normalized.output_tokens_details = outputDetails;
  }
  const sanitized = {};
  for (const key of ALLOWED_RESPONSES_USAGE_FIELDS) {
    if (normalized[key] !== void 0) {
      sanitized[key] = normalized[key];
    }
  }
  const inputTokens = toNumber(sanitized.input_tokens) ?? 0;
  const outputTokens = toNumber(sanitized.output_tokens) ?? 0;
  const totalTokens = toNumber(sanitized.total_tokens) ?? inputTokens + outputTokens;
  sanitized.input_tokens = inputTokens;
  sanitized.output_tokens = outputTokens;
  sanitized.total_tokens = totalTokens;
  return sanitized;
}
function normalizeResponseId(id) {
  if (!id || typeof id !== "string" && typeof id !== "number") {
    return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 29)}`;
  }
  const str = String(id);
  if (str === "") {
    return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 29)}`;
  }
  return str;
}
function normalizeResponsesId(id) {
  if (!id || typeof id !== "string") {
    return `resp_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }
  if (id.startsWith("resp_")) return id;
  return `resp_${id}`;
}
function isResponsesCommentaryMessageItem(item) {
  const itemRecord = toRecord(item);
  if (!itemRecord) return false;
  const type = toString(itemRecord.type) || "message";
  if (type !== "message") return false;
  const role = toString(itemRecord.role) || "assistant";
  const phase = toString(itemRecord.phase);
  return role === "assistant" && phase === "commentary";
}
function sanitizeResponsesStreamingOutputItem(item) {
  const itemRecord = toRecord(item);
  if (!itemRecord) return null;
  const type = toString(itemRecord.type) || "message";
  if (type === "message") {
    const role = toString(itemRecord.role) || "assistant";
    if (isResponsesCommentaryMessageItem(itemRecord)) {
      return null;
    }
    const content = sanitizeResponsesMessageContent(itemRecord.content).filter((part) => {
      const partRecord = toRecord(part);
      const partPhase = partRecord ? toString(partRecord.phase) : void 0;
      return partPhase !== "commentary";
    });
    if (role === "assistant" && content.length === 0) {
      return null;
    }
    return {
      ...itemRecord,
      type: "message",
      role,
      content
    };
  }
  if (type === "reasoning") {
    const summary = Array.isArray(itemRecord.summary) ? itemRecord.summary.map((part) => {
      const partRecord = toRecord(part);
      if (!partRecord) return null;
      return {
        ...partRecord,
        type: toString(partRecord.type) || "summary_text",
        text: collapseExcessiveNewlines(stripZeroWidthText(toString(partRecord.text) || ""))
      };
    }).filter((part) => part !== null) : [];
    return {
      ...itemRecord,
      type: "reasoning",
      summary
    };
  }
  if (type === "function_call") {
    return {
      ...itemRecord,
      type: "function_call",
      arguments: stripZeroWidthToolArgumentJson(itemRecord.arguments)
    };
  }
  if (type === "function_call_output") {
    return {
      ...itemRecord,
      type: "function_call_output",
      output: typeof itemRecord.output === "string" ? collapseExcessiveNewlines(stripZeroWidthText(itemRecord.output)) : JSON.stringify(itemRecord.output ?? "")
    };
  }
  return { ...itemRecord };
}
function sanitizeResponsesStreamingOutput(output) {
  if (!Array.isArray(output)) return [];
  return output.map((item) => sanitizeResponsesStreamingOutputItem(item)).filter((item) => item !== null);
}
const RESPONSES_STREAMING_TEXT_DELTA_EVENTS = /* @__PURE__ */ new Set([
  "response.output_text.delta",
  "response.reasoning_summary_text.delta",
  "response.reasoning_text.delta"
]);
const RESPONSES_STREAMING_TEXT_DONE_EVENTS = /* @__PURE__ */ new Set([
  "response.output_text.done",
  "response.reasoning_summary_text.done",
  "response.reasoning_text.done"
]);
function sanitizeResponsesStreamingEvent(parsedRecord) {
  const sanitized = { ...parsedRecord };
  const eventType = toString(parsedRecord.type) || "";
  if (RESPONSES_STREAMING_TEXT_DELTA_EVENTS.has(eventType) && typeof sanitized.delta === "string") {
    sanitized.delta = stripZeroWidthText(sanitized.delta);
  }
  if (RESPONSES_STREAMING_TEXT_DONE_EVENTS.has(eventType) && typeof sanitized.text === "string") {
    sanitized.text = stripZeroWidthText(sanitized.text);
  }
  if (eventType === "response.function_call_arguments.delta" && typeof sanitized.delta === "string") {
    sanitized.delta = stripZeroWidthText(sanitized.delta);
  }
  if (eventType === "response.function_call_arguments.done" && typeof sanitized.arguments === "string") {
    sanitized.arguments = stripZeroWidthText(sanitized.arguments);
  }
  if (parsedRecord.item !== void 0) {
    const sanitizedItem = sanitizeResponsesStreamingOutputItem(parsedRecord.item);
    if (sanitizedItem) {
      sanitized.item = sanitizedItem;
    } else {
      delete sanitized.item;
      if (eventType === "response.output_item.added" || eventType === "response.output_item.done") {
        sanitized[OMIT_STREAMING_CHUNK_MARKER] = true;
      }
    }
  }
  if (Array.isArray(parsedRecord.output)) {
    const output = sanitizeResponsesStreamingOutput(parsedRecord.output);
    sanitized.output = output;
    const outputText = extractResponsesOutputText(output);
    if (outputText.length > 0) {
      sanitized.output_text = outputText;
    } else {
      delete sanitized.output_text;
    }
  }
  const responseRecord = toRecord(parsedRecord.response);
  if (responseRecord) {
    const responseOutput = Array.isArray(responseRecord.output) ? sanitizeResponsesStreamingOutput(responseRecord.output) : void 0;
    const sanitizedResponse = {
      ...responseRecord,
      ...responseOutput ? { output: responseOutput } : {}
    };
    const responseOutputText = responseOutput ? extractResponsesOutputText(responseOutput) : "";
    if (responseOutputText.length > 0) {
      sanitizedResponse.output_text = responseOutputText;
    } else {
      delete sanitizedResponse.output_text;
    }
    sanitized.response = sanitizedResponse;
  }
  return sanitized;
}
function sanitizeResponsesOutput(output) {
  if (!Array.isArray(output)) return [];
  return output.map((item, index) => sanitizeResponsesOutputItem(item, index)).filter((item) => item !== null);
}
function sanitizeResponsesOutputItem(item, index) {
  const itemRecord = toRecord(item);
  if (!itemRecord) return null;
  const type = toString(itemRecord.type) || "message";
  if (type === "message") {
    const content = sanitizeResponsesMessageContent(itemRecord.content);
    const sanitized = {
      id: toString(itemRecord.id) || `msg_${index}`,
      type: "message",
      role: toString(itemRecord.role) || "assistant",
      content
    };
    return sanitized;
  }
  if (type === "reasoning") {
    const summary = Array.isArray(itemRecord.summary) ? itemRecord.summary.map((part) => {
      const partRecord = toRecord(part);
      if (!partRecord) return null;
      return {
        type: toString(partRecord.type) || "summary_text",
        text: collapseExcessiveNewlines(toString(partRecord.text) || "")
      };
    }).filter((part) => part !== null) : [];
    return {
      ...itemRecord,
      id: toString(itemRecord.id) || `rs_${index}`,
      type: "reasoning",
      summary
    };
  }
  if (type === "function_call") {
    const callId = toString(itemRecord.call_id) || toString(itemRecord.id) || `call_${index}`;
    return {
      id: toString(itemRecord.id) || `fc_${callId}`,
      type: "function_call",
      call_id: callId,
      name: toString(itemRecord.name) || "",
      arguments: stripZeroWidthToolArgumentJson(itemRecord.arguments)
    };
  }
  if (type === "function_call_output") {
    return {
      id: toString(itemRecord.id) || `fco_${toString(itemRecord.call_id) || index}`,
      type: "function_call_output",
      call_id: toString(itemRecord.call_id) || "",
      output: itemRecord.output ?? ""
    };
  }
  return { ...itemRecord, type };
}
function sanitizeResponsesMessageContent(content) {
  if (typeof content === "string") {
    if (content.length === 0) return [];
    return [
      {
        type: "output_text",
        text: collapseExcessiveNewlines(
          stripInternalReasoningPlaceholder(stripInternalToolEnvelopeText(content))
        ),
        annotations: []
      }
    ];
  }
  if (!Array.isArray(content)) return [];
  return content.map((part) => {
    const partRecord = toRecord(part);
    if (!partRecord) {
      if (typeof part === "string") {
        return {
          type: "output_text",
          text: collapseExcessiveNewlines(
            stripInternalReasoningPlaceholder(stripInternalToolEnvelopeText(part))
          ),
          annotations: []
        };
      }
      return null;
    }
    const partType = toString(partRecord.type);
    if (partType === "output_text" || partType === "text" || (partType === void 0 || partType === "") && typeof partRecord.text === "string") {
      return {
        ...partRecord,
        type: "output_text",
        text: collapseExcessiveNewlines(
          stripInternalReasoningPlaceholder(
            stripInternalToolEnvelopeText(toString(partRecord.text) || "")
          )
        ),
        annotations: Array.isArray(partRecord.annotations) ? partRecord.annotations : []
      };
    }
    return { ...partRecord };
  }).filter((part) => part !== null);
}
function extractResponsesOutputText(output) {
  const parts = [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      const partRecord = toRecord(part);
      if (!partRecord) continue;
      if ((partRecord.type === "output_text" || partRecord.type === "text") && typeof partRecord.text === "string" && partRecord.text.length > 0) {
        parts.push(partRecord.text);
      }
    }
  }
  return parts.join("");
}
function convertOpenAIResponseToResponses(openaiResponse) {
  const responseId = normalizeResponsesId(openaiResponse.id);
  const createdAt = toNumber(openaiResponse.created) ?? Math.floor(Date.now() / 1e3);
  const model = toString(openaiResponse.model) || "unknown";
  const choice = Array.isArray(openaiResponse.choices) ? toRecord(openaiResponse.choices[0]) ?? {} : {};
  const message = toRecord(choice.message) || {};
  const output = [];
  const reasoningContent = toString(message.reasoning_content) || (typeof message.reasoning === "string" ? message.reasoning : "");
  if (reasoningContent) {
    output.push({
      id: `rs_${responseId}_0`,
      type: "reasoning",
      summary: [{ type: "summary_text", text: reasoningContent }]
    });
  }
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const messageContent = sanitizeResponsesMessageContent(message.content);
  if (messageContent.length > 0 || !hasToolCalls && !reasoningContent) {
    output.push({
      id: `msg_${responseId}_0`,
      type: "message",
      role: toString(message.role) || "assistant",
      content: messageContent.length > 0 ? messageContent : [{ type: "output_text", text: "", annotations: [] }]
    });
  }
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : message.function_call ? [
    {
      id: toString(choice.id) || "call_0",
      type: "function",
      function: message.function_call
    }
  ] : [];
  for (let index = 0; index < toolCalls.length; index += 1) {
    const toolCall = toRecord(toolCalls[index]) || {};
    const fn = toRecord(toolCall.function) || {};
    const callId = toString(toolCall.id) || `call_${index}`;
    output.push({
      id: `fc_${callId}`,
      type: "function_call",
      call_id: callId,
      name: toString(fn.name) || "",
      arguments: stripZeroWidthToolArgumentJson(fn.arguments)
    });
  }
  const sanitized = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    model,
    status: "completed",
    background: false,
    error: null,
    output
  };
  const outputText = extractResponsesOutputText(output);
  if (outputText.length > 0) {
    sanitized.output_text = outputText;
  }
  if (openaiResponse.usage !== void 0) {
    sanitized.usage = sanitizeResponsesUsage(openaiResponse.usage);
  }
  return sanitized;
}
function sanitizeStreamingChunk(parsed) {
  const parsedRecord = toRecord(parsed);
  if (!parsedRecord) return parsed;
  const eventType = toString(parsedRecord.type) || "";
  if (eventType.startsWith("response.") || parsedRecord.object === "response") {
    return sanitizeResponsesStreamingEvent(parsedRecord);
  }
  if (eventType === "content_block_delta") {
    const deltaRecord = toRecord(parsedRecord.delta);
    if (deltaRecord) {
      if (typeof deltaRecord.text === "string") {
        deltaRecord.text = stripZeroWidthText(deltaRecord.text);
      }
      if (typeof deltaRecord.thinking === "string") {
        deltaRecord.thinking = stripZeroWidthText(deltaRecord.thinking);
      }
    }
    return parsedRecord;
  }
  const sanitized = {};
  if (parsedRecord.id !== void 0 && parsedRecord.id !== null) {
    sanitized.id = normalizeResponseId(
      typeof parsedRecord.id === "string" ? parsedRecord.id : String(parsedRecord.id)
    );
  }
  sanitized.object = toString(parsedRecord.object) || "chat.completion.chunk";
  if (parsedRecord.created !== void 0) sanitized.created = parsedRecord.created;
  if (parsedRecord.model !== void 0) sanitized.model = parsedRecord.model;
  if (Array.isArray(parsedRecord.choices)) {
    sanitized.choices = parsedRecord.choices.map((choice) => {
      const c = { index: 0 };
      const choiceRecord = toRecord(choice);
      if (!choiceRecord) return c;
      c.index = toNumber(choiceRecord.index) ?? 0;
      if (choiceRecord.delta !== void 0) {
        const deltaRecord = toRecord(choiceRecord.delta);
        if (deltaRecord) {
          const delta = {};
          if (deltaRecord.role !== void 0) delta.role = deltaRecord.role;
          if (deltaRecord.content !== void 0) {
            delta.content = typeof deltaRecord.content === "string" ? collapseExcessiveNewlines(stripZeroWidthText(deltaRecord.content)) : deltaRecord.content;
          }
          copyOpenAICompatibleReasoningFields(deltaRecord, delta);
          for (const reasoningKey of ["reasoning_content", "reasoning", "reasoning_text"]) {
            if (typeof delta[reasoningKey] === "string") {
              delta[reasoningKey] = stripZeroWidthText(delta[reasoningKey]);
            }
          }
          if (deltaRecord.tool_calls !== void 0) {
            delta.tool_calls = Array.isArray(deltaRecord.tool_calls) ? deltaRecord.tool_calls.map((tc) => {
              const t = toRecord(tc);
              if (!t) return tc;
              const strippedToolCall = stripZeroWidthToolCallArguments(t);
              const strippedRecord = toRecord(strippedToolCall) || t;
              if (t.id !== void 0 && t.id !== null && typeof t.id !== "string") {
                return { ...strippedRecord, id: String(t.id) };
              }
              return strippedRecord;
            }) : deltaRecord.tool_calls;
          }
          if (deltaRecord.function_call !== void 0)
            delta.function_call = stripZeroWidthFunctionArguments(deltaRecord.function_call);
          c.delta = delta;
        } else {
          c.delta = choiceRecord.delta;
        }
      }
      if (choiceRecord.finish_reason !== void 0) {
        c.finish_reason = normalizeOpenAICompatibleFinishReason(choiceRecord.finish_reason);
      }
      if (choiceRecord.logprobs !== void 0) c.logprobs = choiceRecord.logprobs;
      return c;
    });
  }
  if (parsedRecord.usage !== void 0) {
    sanitized.usage = sanitizeUsage(parsedRecord.usage);
  }
  if (parsedRecord.system_fingerprint) {
    sanitized.system_fingerprint = parsedRecord.system_fingerprint;
  }
  return sanitized;
}
export {
  OMIT_STREAMING_CHUNK_MARKER,
  extractThinkingFromContent2 as extractThinkingFromContent,
  isResponsesCommentaryMessageItem,
  sanitizeOpenAIResponse,
  sanitizeResponsesApiResponse,
  sanitizeStreamingChunk,
  shouldParseTextualReasoningTags
};
