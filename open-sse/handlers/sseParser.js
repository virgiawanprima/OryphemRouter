import { appendToolCallArgumentDelta } from "../utils/omni/toolCallArguments.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
function extractSSEErrorMessage(rawSSE) {
  const lines = String(rawSSE || "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed;
    if (Array.isArray(record.choices)) continue;
    const err = record.error;
    if (err == null) continue;
    let message = "";
    if (typeof err === "string") {
      message = err;
    } else if (typeof err === "object" && !Array.isArray(err)) {
      const errRecord = err;
      if (typeof errRecord.message === "string") {
        message = errRecord.message;
      } else {
        message = JSON.stringify(err);
      }
    } else {
      message = String(err);
    }
    const sanitized = sanitizeErrorMessage(message);
    if (sanitized) return sanitized;
  }
  return null;
}
function readSSEEvents(rawSSE) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];
  let currentEvent = "";
  let currentData = [];
  const flush = () => {
    if (currentData.length === 0) {
      currentEvent = "";
      return;
    }
    const payload = currentData.join("\n").trim();
    currentData = [];
    if (!payload || payload === "[DONE]") {
      currentEvent = "";
      return;
    }
    try {
      const data = JSON.parse(payload);
      if (currentEvent && data && typeof data === "object" && !Array.isArray(data) && typeof data.type !== "string") {
        data.type = currentEvent;
      }
      events.push({
        event: currentEvent || void 0,
        data
      });
    } catch {
    }
    currentEvent = "";
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("event:")) {
      if (currentData.length > 0) flush();
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      const dataLine = line.slice(5).trimStart();
      if (dataLine.trim() === "[DONE]") {
        flush();
        currentEvent = "";
        continue;
      }
      currentData.push(dataLine);
    }
  }
  flush();
  return events;
}
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const chunks = [];
  let sawChoices = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed?.choices)) {
        sawChoices = true;
      }
      chunks.push(parsed);
    } catch {
    }
  }
  if (chunks.length === 0 || !sawChoices) return null;
  const first = chunks[0];
  const contentParts = [];
  const reasoningParts = [];
  const accumulatedToolCalls = /* @__PURE__ */ new Map();
  let unknownToolCallSeq = 0;
  let finishReason = "stop";
  let usage = null;
  const getToolCallKey = (toolCall) => {
    if (Number.isInteger(toolCall?.index)) return `idx:${toolCall.index}`;
    if (toolCall?.id != null) return `id:${String(toolCall.id)}`;
    unknownToolCallSeq += 1;
    return `seq:${unknownToolCallSeq}`;
  };
  for (const chunk of chunks) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      contentParts.push(delta.content);
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      reasoningParts.push(delta.reasoning_content);
    }
    if (typeof delta.reasoning === "string" && delta.reasoning.length > 0 && !delta.reasoning_content) {
      reasoningParts.push(delta.reasoning);
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const key = getToolCallKey(tc);
        const existing = accumulatedToolCalls.get(key);
        const deltaArgs = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";
        if (!existing) {
          accumulatedToolCalls.set(key, {
            id: tc?.id != null ? String(tc.id) : null,
            index: Number.isInteger(tc?.index) ? tc.index : accumulatedToolCalls.size,
            type: tc?.type || "function",
            function: {
              name: tc?.function?.name || "unknown",
              arguments: deltaArgs
            }
          });
        } else {
          existing.id = existing.id || (tc?.id != null ? String(tc.id) : null);
          if (!Number.isInteger(existing.index) && Number.isInteger(tc?.index)) {
            existing.index = tc.index;
          }
          if (tc?.function?.name && !existing.function?.name) {
            existing.function.name = tc.function.name;
          }
          existing.function.arguments = appendToolCallArgumentDelta(
            existing.function.arguments,
            deltaArgs
          );
          accumulatedToolCalls.set(key, existing);
        }
      }
    }
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (chunk?.usage && typeof chunk.usage === "object") {
      usage = chunk.usage;
    }
  }
  const joinedContent = contentParts.length > 0 ? contentParts.join("").trim() : "";
  const joinedReasoning = reasoningParts.length > 0 ? reasoningParts.join("").trim() : null;
  const message = {
    role: "assistant",
    content: joinedContent
  };
  if (joinedReasoning) {
    message.reasoning_content = joinedReasoning;
  }
  const finalToolCalls = [...accumulatedToolCalls.values()].filter(Boolean).sort((a, b) => {
    const ai = Number.isInteger(a?.index) ? a.index : 0;
    const bi = Number.isInteger(b?.index) ? b.index : 0;
    return ai - bi;
  });
  if (finalToolCalls.length > 0) {
    finishReason = "tool_calls";
    message.tool_calls = finalToolCalls;
  }
  const result = {
    id: first.id != null ? String(first.id) : `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: first.created || Math.floor(Date.now() / 1e3),
    model: first.model || fallbackModel || "unknown",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason
      }
    ]
  };
  if (usage) {
    result.usage = usage;
  }
  return result;
}
function parseSSEToClaudeResponse(rawSSE, fallbackModel) {
  const payloads = readSSEEvents(rawSSE).map((event) => toRecord(event.data)).filter((payload) => Object.keys(payload).length > 0);
  if (payloads.length === 0) return null;
  const blocks = /* @__PURE__ */ new Map();
  const usage = {};
  let messageId = "";
  let model = fallbackModel || "claude";
  let role = "assistant";
  let stopReason = "end_turn";
  let stopSequence = null;
  let sawClaudeEvent = false;
  const mergeUsage = (incoming) => {
    const usageRecord = toRecord(incoming);
    for (const [key, value] of Object.entries(usageRecord)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        usage[key] = value;
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        usage[key] = { ...toRecord(usage[key]), ...toRecord(value) };
      } else if (typeof value === "string" && value.trim().length > 0) {
        usage[key] = value;
      }
    }
  };
  const tryParseJson = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
  for (const payload of payloads) {
    const eventType = toString(payload.type);
    if (eventType === "message_start") {
      sawClaudeEvent = true;
      const message = toRecord(payload.message);
      messageId = toString(message.id, messageId || `msg_${Date.now()}`);
      model = toString(message.model, model);
      role = toString(message.role, role);
      mergeUsage(message.usage);
      continue;
    }
    if (eventType === "content_block_start") {
      sawClaudeEvent = true;
      const index = toNumber(payload.index, blocks.size);
      const contentBlock = toRecord(payload.content_block);
      const blockType = toString(contentBlock.type);
      if (blockType === "thinking") {
        blocks.set(index, {
          type: "thinking",
          index,
          thinking: toString(contentBlock.thinking),
          signature: toString(contentBlock.signature) || void 0
        });
      } else if (blockType === "tool_use") {
        blocks.set(index, {
          type: "tool_use",
          index,
          id: toString(contentBlock.id, `toolu_${Date.now()}_${index}`),
          name: toString(contentBlock.name),
          input: contentBlock.input ?? {},
          inputJson: ""
        });
      } else {
        blocks.set(index, {
          type: "text",
          index,
          text: toString(contentBlock.text)
        });
      }
      continue;
    }
    if (eventType === "content_block_delta") {
      sawClaudeEvent = true;
      const index = toNumber(payload.index, 0);
      const delta = toRecord(payload.delta);
      const deltaType = toString(delta.type);
      const existing = blocks.get(index);
      if (deltaType === "input_json_delta") {
        const toolUse = existing && existing.type === "tool_use" ? existing : {
          type: "tool_use",
          index,
          id: `toolu_${Date.now()}_${index}`,
          name: "",
          input: {},
          inputJson: ""
        };
        toolUse.inputJson += toString(delta.partial_json);
        blocks.set(index, toolUse);
        continue;
      }
      const isThinkingDelta = deltaType === "thinking_delta" || typeof delta.thinking === "string";
      const isSignatureDelta = deltaType === "signature_delta" || typeof delta.signature === "string";
      if (isThinkingDelta || isSignatureDelta) {
        const thinking = existing && existing.type === "thinking" ? existing : { type: "thinking", index, thinking: "", signature: void 0 };
        if (isThinkingDelta) thinking.thinking += toString(delta.thinking);
        const signature = toString(delta.signature);
        if (signature) thinking.signature = `${thinking.signature || ""}${signature}`;
        blocks.set(index, thinking);
        continue;
      }
      const textBlock = existing && existing.type === "text" ? existing : {
        type: "text",
        index,
        text: ""
      };
      textBlock.text += toString(delta.text);
      blocks.set(index, textBlock);
      continue;
    }
    if (eventType === "message_delta") {
      sawClaudeEvent = true;
      const delta = toRecord(payload.delta);
      stopReason = toString(delta.stop_reason, stopReason);
      stopSequence = typeof delta.stop_sequence === "string" ? String(delta.stop_sequence) : stopSequence;
      mergeUsage(payload.usage);
      continue;
    }
    mergeUsage(payload.usage);
  }
  if (!sawClaudeEvent) return null;
  const content = [];
  for (const block of [...blocks.values()].sort((a, b) => a.index - b.index)) {
    if (block.type === "text") {
      if (block.text) content.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "thinking") {
      const hasSignature = typeof block.signature === "string" && block.signature.length > 0;
      if (block.thinking || hasSignature) {
        content.push({
          type: "thinking",
          thinking: block.thinking || "",
          ...hasSignature ? { signature: block.signature } : {}
        });
      }
      continue;
    }
    const input = block.inputJson.trim().length > 0 ? tryParseJson(block.inputJson) : block.input;
    content.push({ type: "tool_use", id: block.id, name: block.name, input });
  }
  return {
    id: messageId || `msg_${Date.now()}`,
    type: "message",
    role,
    model,
    content,
    stop_reason: stopReason,
    ...stopSequence ? { stop_sequence: stopSequence } : {},
    ...Object.keys(usage).length > 0 ? { usage } : {}
  };
}
const RESPONSES_TERMINAL_EVENT_TYPES = /* @__PURE__ */ new Set([
  "response.completed",
  "response.done",
  "response.cancelled",
  "response.canceled",
  "response.failed",
  "response.incomplete"
]);
function toOutputIndex(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}
function toIdString(value) {
  return value === null || value === void 0 ? "" : String(value);
}
function cloneResponseItem(item) {
  const record = toRecord(item);
  return {
    ...record,
    id: record.id != null ? String(record.id) : record.id,
    call_id: record.call_id != null ? String(record.call_id) : record.call_id,
    ...Array.isArray(record.content) ? {
      content: record.content.map((contentPart) => {
        const part = toRecord(contentPart);
        return { ...part };
      })
    } : {},
    ...Array.isArray(record.summary) ? {
      summary: record.summary.map((summaryPart) => {
        const part = toRecord(summaryPart);
        return { ...part };
      })
    } : {}
  };
}
function ensureResponsesMessageItem(outputItems, outputIndex) {
  const existing = outputItems.get(outputIndex);
  if (existing?.type === "message") return existing;
  const next = {
    ...existing && typeof existing === "object" ? existing : {},
    id: existing?.id != null ? String(existing.id) : `msg_${Date.now()}_${outputIndex}`,
    type: "message",
    role: "assistant",
    content: Array.isArray(existing?.content) ? existing.content.map((contentPart) => ({ ...toRecord(contentPart) })) : [{ type: "output_text", annotations: [], text: "" }]
  };
  if (next.content.length === 0) {
    next.content.push({ type: "output_text", annotations: [], text: "" });
  }
  outputItems.set(outputIndex, next);
  return next;
}
function ensureResponsesReasoningItem(outputItems, outputIndex, itemId) {
  const existing = outputItems.get(outputIndex);
  if (existing?.type === "reasoning") return existing;
  const next = {
    ...existing && typeof existing === "object" ? existing : {},
    id: itemId || (existing?.id != null ? String(existing.id) : null) || `rs_${Date.now()}_${outputIndex}`,
    type: "reasoning",
    summary: Array.isArray(existing?.summary) ? existing.summary.map((summaryPart) => ({ ...toRecord(summaryPart) })) : [{ type: "summary_text", text: "" }]
  };
  if (next.summary.length === 0) {
    next.summary.push({ type: "summary_text", text: "" });
  }
  outputItems.set(outputIndex, next);
  return next;
}
function ensureResponsesFunctionCallItem(outputItems, outputIndex, itemId, callId, name) {
  const existing = outputItems.get(outputIndex);
  const normalizedItemId = toIdString(itemId);
  const normalizedCallId = toIdString(callId);
  const existingId = existing?.id != null ? String(existing.id) : "";
  const existingCallId = existing?.call_id != null ? String(existing.call_id) : "";
  if (existing?.type === "function_call") {
    if (existing.call_id != null) existing.call_id = String(existing.call_id);
    if (existing.id != null) existing.id = String(existing.id);
    if (normalizedCallId && !existing.call_id) existing.call_id = normalizedCallId;
    if (name && !existing.name) existing.name = name;
    if (normalizedItemId && !existing.id) existing.id = normalizedItemId;
    return existing;
  }
  const next = {
    ...existing && typeof existing === "object" ? existing : {},
    id: normalizedItemId || existingId || `fc_${normalizedCallId || `${Date.now()}_${outputIndex}`}`,
    type: "function_call",
    call_id: normalizedCallId || existingCallId || "",
    name: name || existing?.name || "",
    arguments: typeof existing?.arguments === "string" ? existing.arguments : ""
  };
  outputItems.set(outputIndex, next);
  return next;
}
function mergeResponseItems(existing, incoming) {
  const next = cloneResponseItem(incoming);
  if (!existing || typeof existing !== "object") return next;
  return {
    ...existing,
    ...next,
    ...Array.isArray(next.content) ? {
      content: next.content
    } : {},
    ...Array.isArray(next.summary) ? {
      summary: next.summary
    } : {}
  };
}
function parseSSEToResponsesOutput(rawSSE, fallbackModel) {
  const lines = String(rawSSE || "").split("\n");
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      const record = toRecord(parsed);
      if (Object.keys(record).length > 0) {
        events.push(record);
      }
    } catch {
    }
  }
  if (events.length === 0) return null;
  let terminalResponse = null;
  let terminalEventType = "";
  let latestResponse = null;
  const outputItems = /* @__PURE__ */ new Map();
  for (const evt of events) {
    const eventType = toString(evt?.type);
    const outputIndex = toOutputIndex(evt?.output_index);
    const item = toRecord(evt?.item);
    if (outputIndex !== null && eventType === "response.output_item.added") {
      outputItems.set(outputIndex, cloneResponseItem(item));
    }
    if (outputIndex !== null && eventType === "response.output_item.done") {
      const existing = outputItems.get(outputIndex);
      outputItems.set(outputIndex, mergeResponseItems(existing, item));
    }
    if (outputIndex !== null && eventType === "response.output_text.delta") {
      const messageItem = ensureResponsesMessageItem(outputItems, outputIndex);
      const content = Array.isArray(messageItem.content) ? messageItem.content : [];
      const firstPart = content.length > 0 ? { ...toRecord(content[0]) } : { type: "output_text", annotations: [] };
      firstPart.type = firstPart.type || "output_text";
      firstPart.annotations = Array.isArray(firstPart.annotations) ? firstPart.annotations : [];
      firstPart.text = `${toString(firstPart.text)}${toString(evt.delta)}`;
      content[0] = firstPart;
      messageItem.content = content;
    }
    if (outputIndex !== null && eventType === "response.output_text.done") {
      const messageItem = ensureResponsesMessageItem(outputItems, outputIndex);
      const content = Array.isArray(messageItem.content) ? messageItem.content : [];
      const firstPart = content.length > 0 ? { ...toRecord(content[0]) } : { type: "output_text", annotations: [] };
      firstPart.type = firstPart.type || "output_text";
      firstPart.annotations = Array.isArray(firstPart.annotations) ? firstPart.annotations : [];
      firstPart.text = toString(evt.text, toString(firstPart.text));
      content[0] = firstPart;
      messageItem.content = content;
    }
    if (outputIndex !== null && eventType === "response.reasoning_summary_text.delta") {
      const reasoningItem = ensureResponsesReasoningItem(
        outputItems,
        outputIndex,
        toIdString(evt.item_id)
      );
      const summary = Array.isArray(reasoningItem.summary) ? reasoningItem.summary : [];
      const summaryIndex = typeof evt.summary_index === "number" ? evt.summary_index : 0;
      const part = summary[summaryIndex] && typeof summary[summaryIndex] === "object" ? { ...toRecord(summary[summaryIndex]) } : { type: "summary_text", text: "" };
      part.type = part.type || "summary_text";
      part.text = `${toString(part.text)}${toString(evt.delta)}`;
      summary[summaryIndex] = part;
      reasoningItem.summary = summary;
    }
    if (outputIndex !== null && eventType === "response.reasoning_summary_text.done") {
      const reasoningItem = ensureResponsesReasoningItem(
        outputItems,
        outputIndex,
        toIdString(evt.item_id)
      );
      const summary = Array.isArray(reasoningItem.summary) ? reasoningItem.summary : [];
      const summaryIndex = typeof evt.summary_index === "number" ? evt.summary_index : 0;
      const part = summary[summaryIndex] && typeof summary[summaryIndex] === "object" ? { ...toRecord(summary[summaryIndex]) } : { type: "summary_text", text: "" };
      part.type = part.type || "summary_text";
      part.text = toString(evt.text, toString(part.text));
      summary[summaryIndex] = part;
      reasoningItem.summary = summary;
    }
    if (outputIndex !== null && eventType === "response.function_call_arguments.delta") {
      const functionCallItem = ensureResponsesFunctionCallItem(
        outputItems,
        outputIndex,
        toIdString(evt.item_id),
        "",
        ""
      );
      functionCallItem.arguments = `${toString(functionCallItem.arguments)}${toString(evt.delta)}`;
    }
    if (outputIndex !== null && eventType === "response.function_call_arguments.done") {
      const functionCallItem = ensureResponsesFunctionCallItem(
        outputItems,
        outputIndex,
        toIdString(evt.item_id),
        "",
        ""
      );
      functionCallItem.arguments = toString(evt.arguments, toString(functionCallItem.arguments));
    }
    if (RESPONSES_TERMINAL_EVENT_TYPES.has(eventType) && evt.response) {
      terminalResponse = evt.response;
      terminalEventType = eventType;
    }
    if (evt?.response && typeof evt.response === "object") {
      latestResponse = evt.response;
    } else if (evt?.object === "response") {
      latestResponse = evt;
    }
  }
  const picked = terminalResponse || latestResponse;
  if (!picked || typeof picked !== "object") return null;
  const reconstructedOutput = [...outputItems.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item).filter((item) => item && typeof item === "object");
  const pickedOutput = Array.isArray(picked.output) ? picked.output : [];
  const outputHasMessage = (items) => items.some((item) => toRecord(item).type === "message");
  const chosenOutput = pickedOutput.length > 0 && !outputHasMessage(pickedOutput) && outputHasMessage(reconstructedOutput) ? reconstructedOutput : pickedOutput.length > 0 ? pickedOutput : reconstructedOutput;
  const statusFallback = terminalEventType === "response.cancelled" ? "cancelled" : terminalEventType === "response.canceled" ? "canceled" : terminalEventType === "response.failed" ? "failed" : terminalEventType === "response.incomplete" ? "incomplete" : terminalResponse ? "completed" : "in_progress";
  return {
    id: picked.id != null ? String(picked.id) : `resp_${Date.now()}`,
    object: picked.object || "response",
    model: picked.model || fallbackModel || "unknown",
    output: chosenOutput.map((item) => {
      const record = toRecord(item);
      return {
        ...record,
        id: record.id != null ? String(record.id) : record.id,
        call_id: record.call_id != null ? String(record.call_id) : record.call_id
      };
    }),
    usage: picked.usage || null,
    status: picked.status || statusFallback,
    created_at: picked.created_at || Math.floor(Date.now() / 1e3),
    metadata: picked.metadata || {}
  };
}
export {
  extractSSEErrorMessage,
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse,
  parseSSEToResponsesOutput
};
