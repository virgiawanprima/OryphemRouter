import { FORMATS } from "../../translator/formats.js";
import { hasAnyReasoningSignal } from "../reasoningFields.js";
import { getRegistryEntry } from "./providerRegistry.js";
import { log as engineLog, sanitize } from "../log.js";
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const ANSI_ESCAPE_RE = /\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[A-Z\[\]\\^_`])|[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
function stripAnsiCodes(str) {
  if (typeof str !== "string") return str;
  return str.replace(ANSI_ESCAPE_RE, "");
}
function parseSSEDataPayload(data, options = {}) {
  const payload = String(data ?? "").trim();
  if (!payload) return null;
  if (payload === "[DONE]") return { done: true };
  try {
    const parsed = JSON.parse(payload);
    const eventType = options.eventType;
    if (eventType && isRecord(parsed) && typeof parsed.type !== "string") {
      return { ...parsed, type: eventType };
    }
    return parsed;
  } catch (error) {
    if (options.logWarning !== false && payload.length > 0) {
      engineLog.warn(
        "STREAM",
        `Failed to parse SSE payload (${payload.length} chars): ${sanitize(payload.substring(0, 200))}...`
      );
    }
    return null;
  }
}
function parseSSEDataLines(dataLines, options = {}) {
  return parseSSEDataPayload(dataLines.join("\n"), options);
}
function parseSSELine(line) {
  if (!line) return null;
  const trimmed = line.trimStart();
  const clean = stripAnsiCodes(trimmed);
  if (!clean.startsWith("data:")) return null;
  return parseSSEDataPayload(clean.slice(5));
}
function extractSseDataLine(line) {
  const trimmed = stripAnsiCodes(line.trimStart().replace(/\r$/, ""));
  if (!trimmed.startsWith("data:")) return null;
  return trimmed.slice(5).trimStart();
}
function createSSEDataLineNormalizer() {
  let pendingEventLines = [];
  const getPendingDataLines = () => pendingEventLines.map((line) => extractSseDataLine(line)).filter((line) => line !== null);
  const hasSelfDescribingPendingDataPayload = () => {
    const dataLines = getPendingDataLines();
    const parsed = dataLines.length > 0 ? parseSSEDataLines(dataLines, { logWarning: false }) : null;
    if (!parsed) return false;
    return parsed.done === true || typeof parsed.type === "string" || typeof parsed.object === "string" || Array.isArray(parsed.choices) || Array.isArray(parsed.candidates) || isRecord(parsed.response);
  };
  const flush = (output) => {
    if (pendingEventLines.length === 0) return;
    const eventLines = pendingEventLines.filter((line) => line.trim().length > 0);
    const dataLines = [];
    const passthroughLines = [];
    for (const line of eventLines) {
      const dataLine = extractSseDataLine(line);
      if (dataLine !== null) {
        dataLines.push(dataLine);
      } else {
        passthroughLines.push(line);
      }
    }
    output.push(...passthroughLines);
    if (dataLines.length > 0) {
      const parsed = parseSSEDataLines(dataLines, { logWarning: false });
      if (parsed) {
        output.push(parsed.done === true ? "data: [DONE]" : `data: ${JSON.stringify(parsed)}`);
      } else {
        output.push(...eventLines.filter((line) => extractSseDataLine(line) !== null));
      }
    } else {
      output.push(...eventLines.filter((line) => extractSseDataLine(line) !== null));
    }
    output.push("");
    pendingEventLines = [];
  };
  return {
    hasPending() {
      return pendingEventLines.length > 0;
    },
    normalize(lines) {
      const output = [];
      for (const line of lines) {
        const normalizedLine = line.replace(/\r$/, "");
        const trimmed = normalizedLine.trim();
        if (trimmed && /^(?:event:|id:|retry:|:)/i.test(trimmed) && hasSelfDescribingPendingDataPayload()) {
          flush(output);
        }
        pendingEventLines.push(normalizedLine);
        if (!trimmed) {
          flush(output);
        }
      }
      return output;
    }
  };
}
function createSSEEventPrefixBuffer(options) {
  let lines = [];
  let emitted = false;
  const forwardEvent = options?.forwardEvent !== false;
  const hasUnemitted = () => lines.length > 0 && !emitted;
  const prefix = (output) => {
    if (!hasUnemitted()) return output;
    emitted = true;
    return `${lines.join("\n")}
${output}`;
  };
  return {
    clear() {
      lines = [];
      emitted = false;
    },
    eventType() {
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].trim().match(/^event:\s*(.+)$/i);
        if (match) return match[1].trim();
      }
      return "";
    },
    flush() {
      return hasUnemitted() ? prefix("\n") : "";
    },
    prefixData(output, line) {
      return line.startsWith("data:") ? prefix(output) : output;
    },
    remember(line) {
      const trimmed = line.trim();
      if (/^(?::|id:|retry:)/i.test(trimmed)) return;
      if (/^event:/i.test(trimmed) && !forwardEvent) return;
      lines.push(line);
      emitted = false;
    }
  };
}
function hasOpenAICompatibleStreamValue(parsed) {
  if (!Array.isArray(parsed.choices)) return false;
  return parsed.choices.some((choice) => {
    if (!isRecord(choice)) return false;
    const delta = isRecord(choice.delta) ? choice.delta : null;
    if (!delta) return false;
    if (typeof delta.content === "string" && delta.content.length > 0) return true;
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      return true;
    }
    if (typeof delta.reasoning_text === "string" && delta.reasoning_text.length > 0) {
      return true;
    }
    return Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0;
  });
}
function hasResponsesStreamValue(parsed, eventType = "") {
  const type = typeof parsed.type === "string" ? parsed.type : eventType;
  if (!type.startsWith("response.")) return false;
  if (type === "response.output_text.delta" || type === "response.reasoning_text.delta" || type === "response.reasoning_summary_text.delta" || type === "response.function_call_arguments.delta") {
    return typeof parsed.delta === "string" && parsed.delta.length > 0 || typeof parsed.text === "string" && parsed.text.length > 0 || typeof parsed.arguments === "string" && parsed.arguments.length > 0;
  }
  if (type === "response.output_item.added" || type === "response.output_item.done") {
    return isRecord(parsed.item);
  }
  if (type === "response.content_part.added") {
    return isRecord(parsed.part);
  }
  if (type === "response.completed" && isRecord(parsed.response)) {
    const output = parsed.response.output;
    return Array.isArray(output) && output.length > 0;
  }
  return false;
}
function hasGeminiCandidateStreamValue(parsed) {
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : isRecord(parsed.response) && Array.isArray(parsed.response.candidates) ? parsed.response.candidates : [];
  return candidates.some((candidate) => {
    if (!isRecord(candidate)) return false;
    const content = isRecord(candidate.content) ? candidate.content : null;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts.some((part) => {
      if (!isRecord(part)) return false;
      if (typeof part.text === "string" && part.text.length > 0) return true;
      return isRecord(part.functionCall) || isRecord(part.executableCode);
    });
  });
}
function isOpenAIChoicesPayload(parsed) {
  return Array.isArray(parsed.choices);
}
function hasOpenAIFinishReason(parsed) {
  if (!Array.isArray(parsed.choices)) return false;
  return parsed.choices.some((choice) => isRecord(choice) && choice.finish_reason != null);
}
function isKnownNonClaudeStreamPayload(parsed, eventType = "") {
  if (Array.isArray(parsed.choices)) {
    return hasOpenAICompatibleStreamValue(parsed);
  }
  const objectType = typeof parsed.object === "string" ? parsed.object : "";
  if (objectType === "chat.completion.chunk" || objectType === "text_completion" || objectType.endsWith(".completion.chunk")) {
    return hasOpenAICompatibleStreamValue(parsed);
  }
  const type = typeof parsed.type === "string" ? parsed.type : eventType;
  if (type.startsWith("response.")) return hasResponsesStreamValue(parsed, eventType);
  if (Array.isArray(parsed.candidates)) return hasGeminiCandidateStreamValue(parsed);
  const response = parsed.response;
  return isRecord(response) && Array.isArray(response.candidates) ? hasGeminiCandidateStreamValue(parsed) : false;
}
function hasValuableContent(chunk, format) {
  if (format === FORMATS.OPENAI) {
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : null;
    const delta = isRecord(firstChoice?.delta) ? firstChoice.delta : null;
    if (!firstChoice || !delta) return false;
    if (typeof delta.content === "string" && delta.content.length > 0) return true;
    if (hasAnyReasoningSignal(delta)) return true;
    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) return true;
    if (firstChoice.finish_reason) return true;
    if (typeof delta.role === "string" && delta.role.length > 0) return true;
    return false;
  }
  if (format === FORMATS.CLAUDE) {
    const isContentBlockDelta = chunk.type === "content_block_delta";
    if (isContentBlockDelta) {
      const delta = isRecord(chunk.delta) ? chunk.delta : {};
      const hasText = typeof delta.text === "string" && delta.text.length > 0;
      const hasThinking = typeof delta.thinking === "string" && delta.thinking.length > 0;
      const hasInputJson = typeof delta.partial_json === "string" && delta.partial_json.length > 0;
      if (!hasText && !hasThinking && !hasInputJson) return false;
    }
    return true;
  }
  if ((format === FORMATS.GEMINI || format === FORMATS.ANTIGRAVITY) && Array.isArray(chunk.candidates) && chunk.candidates[0]) {
    const candidate = isRecord(chunk.candidates[0]) ? chunk.candidates[0] : {};
    if (candidate.finishReason) return true;
    const content = isRecord(candidate.content) ? candidate.content : null;
    const parts = Array.isArray(content?.parts) ? content.parts : null;
    if (!parts || parts.length === 0) return false;
    const hasContent = parts.some((p) => {
      const part = isRecord(p) ? p : {};
      return typeof part.text === "string" && part.text.length > 0 || part.functionCall || part.executableCode;
    });
    return hasContent;
  }
  return true;
}
function unwrapGeminiChunk(parsed) {
  if (!parsed.candidates && isRecord(parsed.response)) {
    return parsed.response;
  }
  return parsed;
}
function fixInvalidId(parsed) {
  if (typeof parsed.id === "string" && (parsed.id === "chat" || parsed.id === "completion" || parsed.id.length < 8)) {
    const extendFields = isRecord(parsed.extend_fields) ? parsed.extend_fields : {};
    const fallbackId = extendFields.requestId || extendFields.traceId || Date.now().toString(36);
    parsed.id = `chatcmpl-${fallbackId}`;
    return true;
  }
  return false;
}
function cleanPerfMetrics(data) {
  if (isRecord(data) && isRecord(data.usage) && data.usage.perf_metrics === null) {
    delete data.usage.perf_metrics;
  }
  return data;
}
function formatSSE(data, sourceFormat) {
  if (data === null || data === void 0) return "";
  if (isRecord(data) && data.done) return "data: [DONE]\n\n";
  if (isRecord(data) && data.event && data.data) {
    return `event: ${data.event}
data: ${JSON.stringify(data.data)}

`;
  }
  data = cleanPerfMetrics(data);
  if (sourceFormat === FORMATS.CLAUDE && isRecord(data) && data.type) {
    return `event: ${data.type}
data: ${JSON.stringify(data)}

`;
  }
  return `data: ${JSON.stringify(data)}

`;
}
function buildSyntheticChatChunk(responsesId, model, delta, finishReason = null) {
  return {
    id: responsesId || `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model: model || "unknown",
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  };
}
const STREAM_SUMMARY_TEXT_LIMIT = 64 * 1024;
function appendBoundedText(current, next) {
  if (!next) return current;
  if (current.length >= STREAM_SUMMARY_TEXT_LIMIT) {
    const keep = STREAM_SUMMARY_TEXT_LIMIT - next.length;
    if (keep <= 0) return next.slice(-STREAM_SUMMARY_TEXT_LIMIT);
    return current.slice(-keep) + next;
  }
  const combined = current + next;
  if (combined.length <= STREAM_SUMMARY_TEXT_LIMIT) return combined;
  return combined.slice(-STREAM_SUMMARY_TEXT_LIMIT);
}
function hasActiveDeltaValue(value) {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.some((entry) => hasActiveDeltaValue(entry));
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasActiveDeltaValue(entry));
  }
  return value !== null && value !== void 0;
}
function injectThinkingSignature(parsed, provider) {
  if (provider !== null && getRegistryEntry(provider)?.ensureThinkingSignature === true && parsed.type === "content_block_start" && parsed.content_block?.type === "thinking" && parsed.content_block.signature === void 0) {
    parsed.content_block.signature = "";
    return true;
  }
  return false;
}
export {
  appendBoundedText,
  buildSyntheticChatChunk,
  createSSEDataLineNormalizer,
  createSSEEventPrefixBuffer,
  fixInvalidId,
  formatSSE,
  hasActiveDeltaValue,
  hasOpenAIFinishReason,
  hasValuableContent,
  injectThinkingSignature,
  isKnownNonClaudeStreamPayload,
  isOpenAIChoicesPayload,
  parseSSEDataLines,
  parseSSEDataPayload,
  parseSSELine,
  stripAnsiCodes,
  unwrapGeminiChunk
};
