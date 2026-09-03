import { cloneLogPayload } from "./omni/logPayloads.js";
import { FORMATS } from "../translator/formats.js";
function getEventName(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return void 0;
  if (typeof payload.event === "string") {
    return payload.event;
  }
  if (typeof payload.type === "string") {
    return payload.type;
  }
  if (payload.done === true) {
    return "[DONE]";
  }
  return void 0;
}
function asRecord(value) {
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
function normalizeFormat(format) {
  if (!format) return "";
  if (format === FORMATS.OPENAI_RESPONSE) return FORMATS.OPENAI_RESPONSES;
  return format;
}
function inferFormatFromEvents(events, fallbackFormat) {
  const normalizedFallback = normalizeFormat(fallbackFormat);
  if (normalizedFallback) return normalizedFallback;
  for (const evt of events) {
    const payload = asRecord(evt.data);
    const eventType = toString(payload.type || evt.event);
    if (eventType.startsWith("response.") || payload.object === "response") {
      return FORMATS.OPENAI_RESPONSES;
    }
    if (eventType === "message_start" || eventType === "content_block_start" || eventType === "content_block_delta" || eventType === "message_delta" || eventType === "message_stop" || eventType === "ping") {
      return FORMATS.CLAUDE;
    }
    if (Array.isArray(payload.candidates) || payload.usageMetadata) {
      return FORMATS.GEMINI;
    }
  }
  return FORMATS.OPENAI;
}
function mergeUsage(target, incoming) {
  const usage = asRecord(incoming);
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (target[key] === void 0 || value > 0) {
        target[key] = value;
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = { ...asRecord(target[key]), ...asRecord(value) };
    } else if (typeof value === "string" && value.trim().length > 0) {
      target[key] = value;
    }
  }
}
function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function splitConcatenatedToolCallArguments(raw) {
  if (!raw) return null;
  try {
    JSON.parse(raw);
    return null;
  } catch {
  }
  const parts = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (start === -1) {
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "	") continue;
      if (ch !== "{" && ch !== "[") return null;
      start = i;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        parts.push(raw.slice(start, i + 1));
        start = -1;
      }
    }
  }
  if (start !== -1 || depth !== 0 || parts.length < 2) return null;
  for (const part of parts) {
    try {
      JSON.parse(part);
    } catch {
      return null;
    }
  }
  return parts;
}
function createOpenAIReducer(fallbackModel) {
  let first = null;
  const contentParts = [];
  const reasoningParts = [];
  const toolCalls = /* @__PURE__ */ new Map();
  const keyAliases = /* @__PURE__ */ new Map();
  let unknownToolCallSeq = 0;
  let finishReason = "stop";
  let usage = null;
  const getToolCallKey = (toolCall) => {
    const idKey = typeof toolCall.id === "string" && toolCall.id ? `id:${toolCall.id}` : null;
    const idxKey = Number.isInteger(toolCall.index) ? `idx:${toolCall.index}` : null;
    const resolvedKey = idKey && keyAliases.get(idKey) || idxKey && keyAliases.get(idxKey);
    const key = resolvedKey || idKey || idxKey;
    if (key) {
      if (idKey) keyAliases.set(idKey, key);
      if (idxKey) keyAliases.set(idxKey, key);
      return key;
    }
    unknownToolCallSeq += 1;
    return `seq:${unknownToolCallSeq}`;
  };
  return {
    ingest(chunk) {
      if (Object.keys(chunk).length === 0) return;
      if (!first) first = chunk;
      const choice = asRecord(Array.isArray(chunk.choices) ? chunk.choices[0] : null);
      const delta = asRecord(choice.delta);
      if (typeof delta.content === "string" && delta.content.length > 0) {
        contentParts.push(delta.content);
      }
      if (Array.isArray(delta.content)) {
        for (const part of delta.content) {
          const partObj = asRecord(part);
          if (typeof partObj.text === "string" && partObj.text.length > 0) {
            contentParts.push(partObj.text);
          }
        }
      }
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        reasoningParts.push(delta.reasoning_content);
      }
      if (typeof delta.reasoning === "string" && delta.reasoning.length > 0 && !delta.reasoning_content) {
        reasoningParts.push(delta.reasoning);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const item of delta.tool_calls) {
          const toolCall = asRecord(item);
          const key = getToolCallKey(toolCall);
          const existing = toolCalls.get(key);
          const deltaArgs = typeof asRecord(toolCall.function).arguments === "string" ? String(asRecord(toolCall.function).arguments) : "";
          if (!existing) {
            toolCalls.set(key, {
              id: typeof toolCall.id === "string" ? toolCall.id : null,
              index: Number.isInteger(toolCall.index) ? Number(toolCall.index) : toolCalls.size,
              type: toString(toolCall.type, "function"),
              function: {
                name: toString(asRecord(toolCall.function).name, "unknown"),
                arguments: deltaArgs
              }
            });
            continue;
          }
          existing.id = existing.id || (typeof toolCall.id === "string" ? toolCall.id : null);
          if ((!Number.isInteger(existing.index) || existing.index < 0) && Number.isInteger(toolCall.index)) {
            existing.index = Number(toolCall.index);
          }
          if (typeof asRecord(toolCall.function).name === "string" && !existing.function.name) {
            existing.function.name = String(asRecord(toolCall.function).name);
          }
          existing.function.arguments += deltaArgs;
        }
      }
      if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
        finishReason = choice.finish_reason;
      }
      if (chunk.usage && typeof chunk.usage === "object") {
        usage = { ...asRecord(chunk.usage) };
      }
    },
    finalize() {
      if (!first) return null;
      const joinedContent = contentParts.length > 0 ? contentParts.join("").trim() : null;
      const joinedReasoning = reasoningParts.length > 0 ? reasoningParts.join("").trim() : null;
      const message = {
        role: "assistant",
        content: joinedContent || null
      };
      if (joinedReasoning) {
        message.reasoning_content = joinedReasoning;
      }
      const mergedToolCalls = [...toolCalls.values()].sort((a, b) => a.index - b.index);
      const finalToolCalls = [];
      let nextIndex = 0;
      for (const tc of mergedToolCalls) {
        const splitArgs = splitConcatenatedToolCallArguments(tc.function.arguments);
        if (!splitArgs) {
          finalToolCalls.push({ ...tc, index: nextIndex++ });
          continue;
        }
        for (const [i, args] of splitArgs.entries()) {
          finalToolCalls.push({
            id: tc.id ? `${tc.id}_split${i}` : null,
            index: nextIndex++,
            type: tc.type,
            function: { name: tc.function.name, arguments: args }
          });
        }
      }
      if (finalToolCalls.length > 0) {
        finishReason = "tool_calls";
        message.tool_calls = finalToolCalls;
      }
      const result = {
        id: toString(first.id, `chatcmpl-${Date.now()}`),
        object: "chat.completion",
        created: toNumber(first.created, Math.floor(Date.now() / 1e3)),
        model: toString(first.model, fallbackModel || "unknown"),
        choices: [
          {
            index: 0,
            message,
            finish_reason: finishReason
          }
        ]
      };
      if (usage && Object.keys(usage).length > 0) {
        result.usage = usage;
      }
      return result;
    }
  };
}
function createResponsesReducer(fallbackModel) {
  let sawAny = false;
  let completed = null;
  let latestResponse = null;
  let usage = null;
  const textParts = [];
  const buildOutputFromText = () => textParts.length > 0 ? [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: textParts.join("") }]
    }
  ] : [];
  return {
    ingest(payload) {
      if (Object.keys(payload).length === 0) return;
      sawAny = true;
      const eventType = toString(payload.type);
      if (eventType === "response.completed" && payload.response && typeof payload.response === "object") {
        completed = asRecord(payload.response);
      }
      if (payload.response && typeof payload.response === "object") {
        latestResponse = asRecord(payload.response);
      } else if (payload.object === "response") {
        latestResponse = payload;
      }
      if (eventType === "response.output_text.delta" && typeof payload.delta === "string" && payload.delta.length > 0) {
        textParts.push(payload.delta);
      }
      if (payload.usage && typeof payload.usage === "object") {
        usage = { ...asRecord(payload.usage) };
      } else if (payload.response && typeof asRecord(payload.response).usage === "object") {
        usage = { ...asRecord(asRecord(payload.response).usage) };
      }
    },
    finalize() {
      if (!sawAny) return null;
      const picked = completed || latestResponse;
      if (picked && Object.keys(picked).length > 0) {
        const pickedOutput = Array.isArray(picked.output) ? picked.output : [];
        return {
          id: toString(picked.id, `resp_${Date.now()}`),
          object: "response",
          model: toString(picked.model, fallbackModel || "unknown"),
          output: pickedOutput.length > 0 ? pickedOutput : buildOutputFromText(),
          usage: picked.usage ?? usage ?? null,
          status: toString(picked.status, completed ? "completed" : "in_progress"),
          created_at: toNumber(picked.created_at, Math.floor(Date.now() / 1e3)),
          metadata: asRecord(picked.metadata)
        };
      }
      return {
        id: `resp_${Date.now()}`,
        object: "response",
        model: fallbackModel || "unknown",
        output: buildOutputFromText(),
        usage: usage ?? null,
        status: "completed",
        created_at: Math.floor(Date.now() / 1e3),
        metadata: {}
      };
    }
  };
}
function createClaudeReducer(fallbackModel) {
  let sawAny = false;
  const blocks = /* @__PURE__ */ new Map();
  const usage = {};
  let messageId = "";
  let model = fallbackModel || "claude";
  let role = "assistant";
  let stopReason = "end_turn";
  let stopSequence = null;
  let contextManagement = null;
  return {
    ingest(payload) {
      if (Object.keys(payload).length === 0) return;
      sawAny = true;
      const eventType = toString(payload.type);
      if (payload.context_management && typeof payload.context_management === "object" && !Array.isArray(payload.context_management)) {
        contextManagement = asRecord(payload.context_management);
      }
      if (eventType === "message_start") {
        const message = asRecord(payload.message);
        messageId = toString(message.id, messageId || `msg_${Date.now()}`);
        model = toString(message.model, model);
        role = toString(message.role, role);
        mergeUsage(usage, message.usage);
        return;
      }
      if (eventType === "content_block_start") {
        const index = toNumber(payload.index, blocks.size);
        const contentBlock = asRecord(payload.content_block);
        const blockType = toString(contentBlock.type);
        if (blockType === "thinking") {
          blocks.set(index, {
            type: "thinking",
            index,
            thinking: toString(contentBlock.thinking),
            signature: typeof contentBlock.signature === "string" ? contentBlock.signature : void 0
          });
        } else if (blockType === "tool_use") {
          blocks.set(index, {
            type: "tool_use",
            index,
            id: toString(contentBlock.id, `toolu_${Date.now()}_${index}`),
            name: toString(contentBlock.name),
            input: cloneLogPayload(contentBlock.input ?? {}),
            inputJson: ""
          });
        } else {
          blocks.set(index, {
            type: "text",
            index,
            text: toString(contentBlock.text)
          });
        }
        return;
      }
      if (eventType === "content_block_delta") {
        const index = toNumber(payload.index, 0);
        const delta = asRecord(payload.delta);
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
          return;
        }
        if (deltaType === "thinking_delta" || typeof delta.thinking === "string") {
          const thinking = existing && existing.type === "thinking" ? existing : { type: "thinking", index, thinking: "", signature: void 0 };
          thinking.thinking += toString(delta.thinking);
          blocks.set(index, thinking);
          return;
        }
        const textBlock = existing && existing.type === "text" ? existing : {
          type: "text",
          index,
          text: ""
        };
        textBlock.text += toString(delta.text);
        blocks.set(index, textBlock);
        return;
      }
      if (eventType === "message_delta") {
        const delta = asRecord(payload.delta);
        stopReason = toString(delta.stop_reason, stopReason);
        stopSequence = typeof delta.stop_sequence === "string" ? String(delta.stop_sequence) : stopSequence;
        mergeUsage(usage, payload.usage);
        return;
      }
      mergeUsage(usage, payload.usage);
    },
    finalize() {
      if (!sawAny) return null;
      const content = [...blocks.values()].sort((a, b) => a.index - b.index).flatMap((block) => {
        if (block.type === "text") {
          return block.text ? [
            {
              type: "text",
              text: block.text
            }
          ] : [];
        }
        if (block.type === "thinking") {
          return block.thinking ? [
            {
              type: "thinking",
              thinking: block.thinking,
              ...block.signature ? { signature: block.signature } : {}
            }
          ] : [];
        }
        const parsedInput = block.inputJson.trim().length > 0 ? tryParseJson(block.inputJson) : cloneLogPayload(block.input);
        return [
          {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: parsedInput
          }
        ];
      });
      return {
        id: messageId || `msg_${Date.now()}`,
        type: "message",
        role,
        model,
        content,
        stop_reason: stopReason,
        ...stopSequence ? { stop_sequence: stopSequence } : {},
        ...Object.keys(usage).length > 0 ? { usage } : {},
        ...contextManagement ? { context_management: contextManagement } : {}
      };
    }
  };
}
function createGeminiReducer(fallbackModel) {
  let sawAny = false;
  const parts = [];
  const usageMetadata = {};
  let modelVersion = fallbackModel || "gemini";
  let finishReason = "STOP";
  let role = "model";
  const appendPart = (part) => {
    const last = parts[parts.length - 1];
    if (last && typeof last.text === "string" && typeof part.text === "string" && Boolean(last.thought) === Boolean(part.thought)) {
      last.text += part.text;
      return;
    }
    parts.push(part);
  };
  return {
    ingest(payload) {
      if (Object.keys(payload).length === 0) return;
      sawAny = true;
      if (typeof payload.modelVersion === "string" && payload.modelVersion.length > 0) {
        modelVersion = payload.modelVersion;
      }
      mergeUsage(usageMetadata, payload.usageMetadata);
      const candidate = asRecord(Array.isArray(payload.candidates) ? payload.candidates[0] : null);
      if (typeof candidate.finishReason === "string" && candidate.finishReason.length > 0) {
        finishReason = candidate.finishReason;
      }
      const content = asRecord(candidate.content);
      if (typeof content.role === "string" && content.role.length > 0) {
        role = content.role;
      }
      if (!Array.isArray(content.parts)) return;
      for (const item of content.parts) {
        const part = asRecord(item);
        if (part.functionCall && typeof part.functionCall === "object") {
          parts.push({
            functionCall: cloneLogPayload(part.functionCall)
          });
        } else if (typeof part.text === "string" && part.text.length > 0) {
          appendPart({
            text: part.text,
            ...part.thought === true ? { thought: true } : {}
          });
        }
      }
    },
    finalize() {
      if (!sawAny) return null;
      return {
        candidates: [
          {
            index: 0,
            content: {
              role,
              parts
            },
            finishReason
          }
        ],
        ...Object.keys(usageMetadata).length > 0 ? { usageMetadata } : {},
        modelVersion
      };
    }
  };
}
function createSummaryReducer(format, fallbackModel) {
  const normalized = normalizeFormat(format);
  if (!normalized) return void 0;
  switch (normalized) {
    case FORMATS.OPENAI_RESPONSES:
      return createResponsesReducer(fallbackModel);
    case FORMATS.CLAUDE:
      return createClaudeReducer(fallbackModel);
    case FORMATS.GEMINI:
    case FORMATS.ANTIGRAVITY:
      return createGeminiReducer(fallbackModel);
    default:
      return createOpenAIReducer(fallbackModel);
  }
}
function buildOpenAISummary(events, fallbackModel) {
  const reducer = createOpenAIReducer(fallbackModel);
  for (const evt of events) reducer.ingest(asRecord(evt.data));
  return reducer.finalize();
}
function buildResponsesSummary(events, fallbackModel) {
  const reducer = createResponsesReducer(fallbackModel);
  for (const evt of events) reducer.ingest(asRecord(evt.data));
  return reducer.finalize();
}
function buildClaudeSummary(events, fallbackModel) {
  const reducer = createClaudeReducer(fallbackModel);
  for (const evt of events) reducer.ingest(asRecord(evt.data));
  return reducer.finalize();
}
function buildGeminiSummary(events, fallbackModel) {
  const reducer = createGeminiReducer(fallbackModel);
  for (const evt of events) reducer.ingest(asRecord(evt.data));
  return reducer.finalize();
}
function buildStreamSummaryFromEvents(events, fallbackFormat, fallbackModel) {
  const format = inferFormatFromEvents(events, fallbackFormat);
  switch (format) {
    case FORMATS.OPENAI_RESPONSES:
      return buildResponsesSummary(events, fallbackModel);
    case FORMATS.CLAUDE:
      return buildClaudeSummary(events, fallbackModel);
    case FORMATS.GEMINI:
    case FORMATS.ANTIGRAVITY:
      return buildGeminiSummary(events, fallbackModel);
    default:
      return buildOpenAISummary(events, fallbackModel);
  }
}
function compactStructuredStreamPayload(payload) {
  const record = asRecord(payload);
  if (record._streamed !== true || !("summary" in record)) {
    return payload;
  }
  const streamMeta = {
    format: toString(record._format, "sse-json"),
    stage: toString(record._stage, "response"),
    eventCount: toNumber(record._eventCount, 0)
  };
  if (record._truncated === true) {
    streamMeta.truncated = true;
  }
  if (typeof record._droppedEvents === "number" && record._droppedEvents > 0) {
    streamMeta.droppedEvents = record._droppedEvents;
  }
  const summary = cloneLogPayload(record.summary);
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    return {
      ...summary,
      _omniroute_stream: streamMeta
    };
  }
  return {
    summary,
    _omniroute_stream: streamMeta
  };
}
function createStructuredSSECollector(options = {}) {
  const { maxEvents = 200, maxBytes = 49152, stage, format, fallbackModel } = options;
  const events = [];
  let usedBytes = 0;
  let droppedEvents = 0;
  const reducer = createSummaryReducer(format, fallbackModel);
  return {
    push(payload, explicitEvent) {
      if (payload === null || payload === void 0) return;
      const clonedData = cloneLogPayload(payload);
      reducer?.ingest(asRecord(clonedData));
      const event = {
        index: events.length + droppedEvents,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: clonedData
      };
      const eventName = explicitEvent || getEventName(payload);
      if (eventName) {
        event.event = eventName;
      }
      const serializedSize = JSON.stringify(event).length;
      if (events.length >= maxEvents || usedBytes + serializedSize > maxBytes) {
        droppedEvents += 1;
        return;
      }
      usedBytes += serializedSize;
      events.push(event);
    },
    getEvents() {
      return events.map((event) => cloneLogPayload(event));
    },
    // The reducer-computed summary, built incrementally from EVERY pushed
    // payload (see CollectorOptions.format) — unlike
    // buildStreamSummaryFromEvents(getEvents(), ...), this is correct even
    // once the collector has truncated its retained event array. Returns
    // undefined if no format was configured (e.g. the client-response
    // collector, which builds its summary from independently-accumulated
    // response state instead).
    getSummary() {
      return reducer?.finalize();
    },
    build(summary, buildOptions = {}) {
      const { includeEvents = true } = buildOptions;
      return {
        _streamed: true,
        _format: "sse-json",
        ...stage ? { _stage: stage } : {},
        _eventCount: events.length + droppedEvents,
        ...droppedEvents > 0 ? { _truncated: true, _droppedEvents: droppedEvents } : {},
        ...includeEvents ? { events } : {},
        ...summary === void 0 ? {} : { summary: cloneLogPayload(summary) }
      };
    }
  };
}
export {
  buildStreamSummaryFromEvents,
  compactStructuredStreamPayload,
  createStructuredSSECollector,
  splitConcatenatedToolCallArguments
};
