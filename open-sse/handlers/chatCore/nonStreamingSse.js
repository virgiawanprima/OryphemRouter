import { FORMATS } from "../../translator/formats.js";
import {
  parseSSEToResponsesOutput,
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse
} from "../sseParser.js";
import { parseSSEToGeminiResponse } from "../sseParser/geminiResponse.js";
import { getHeaderValueCaseInsensitive } from "./headers.js";
function parseNonStreamingSSEPayload(rawBody, preferredFormat, fallbackModel) {
  const formatsToTry = [];
  const seen = /* @__PURE__ */ new Set();
  const queueFormat = (format) => {
    if (!format || seen.has(format)) return;
    seen.add(format);
    formatsToTry.push(format);
  };
  queueFormat(preferredFormat);
  queueFormat(FORMATS.GEMINI);
  queueFormat(FORMATS.OPENAI_RESPONSES);
  queueFormat(FORMATS.CLAUDE);
  queueFormat(FORMATS.OPENAI);
  for (const format of formatsToTry) {
    const parsed = format === FORMATS.OPENAI_RESPONSES ? parseSSEToResponsesOutput(rawBody, fallbackModel) : format === FORMATS.CLAUDE ? parseSSEToClaudeResponse(rawBody, fallbackModel) : format === FORMATS.GEMINI || format === FORMATS.ANTIGRAVITY ? parseSSEToGeminiResponse(rawBody, fallbackModel) : parseSSEToOpenAIResponse(rawBody, fallbackModel);
    if (parsed && typeof parsed === "object") {
      return {
        body: parsed,
        format
      };
    }
  }
  return null;
}
function convertNDJSONToSSE(rawBody) {
  const chunks = String(rawBody || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (chunks.length === 0) return rawBody;
  return `${chunks.map((chunk) => `data: ${chunk}
`).join("\n")}
`;
}
function normalizeNonStreamingEventPayload(rawBody, contentType) {
  if (contentType.includes("application/x-ndjson")) {
    return convertNDJSONToSSE(rawBody);
  }
  return rawBody;
}
function isTruthyStreamBody(body) {
  return !!body && typeof body === "object" && body.stream === true;
}
function isEventStreamAccepted(headers) {
  return (getHeaderValueCaseInsensitive(headers, "accept") || "").toLowerCase().includes("text/event-stream");
}
function shouldTreatBufferedEventResponseAsExpected(upstreamStream, providerHeaders, finalBody) {
  return upstreamStream || isEventStreamAccepted(providerHeaders) || isTruthyStreamBody(finalBody);
}
const NON_STREAMING_SSE_TERMINAL_TYPES = /* @__PURE__ */ new Set([
  "message_stop",
  "response.completed",
  "response.done",
  "response.cancelled",
  "response.canceled",
  "response.failed",
  "response.incomplete"
]);
function isNonStreamingSseTerminalType(eventType) {
  return NON_STREAMING_SSE_TERMINAL_TYPES.has(eventType);
}
function hasClaudeTerminalMessageDelta(parsed, eventType) {
  if (eventType !== "message_delta" || !parsed || typeof parsed !== "object") return false;
  const delta = parsed.delta;
  if (!delta || typeof delta !== "object") return false;
  const stopReason = delta.stop_reason;
  return typeof stopReason === "string" ? stopReason.length > 0 : stopReason != null;
}
function hasGeminiTerminalFinishReason(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed;
  const candidates = obj.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return false;
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return false;
  const finishReason = candidate.finishReason;
  return typeof finishReason === "string" && finishReason.length > 0;
}
function processNonStreamingSseTerminalLine(state, rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    const terminalEventOnly = !trimmed && isNonStreamingSseTerminalType(state.currentEvent);
    if (!trimmed) state.currentEvent = "";
    return terminalEventOnly;
  }
  if (trimmed.startsWith("event:")) {
    state.currentEvent = trimmed.slice(6).trim();
    return false;
  }
  if (!trimmed.startsWith("data:")) return false;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return true;
  if (!data) return false;
  if (!data.includes('"type"') && // NOTE: "finishReason" is a superset match -- it triggers JSON.parse on
  // every Gemini chunk that happens to contain the string (e.g. partial
  // candidate payloads), not just the terminal one.  This is intentional:
  // the extra parses are cheap compared to the CPU-runaway we'd get from
  // parsing ALL chunks unconditionally on large buffered responses, and
  // the superset is safe (false positives just parse a non-terminal chunk
  // and fall through to `return false`).
  !data.includes('"finishReason"') && !(state.currentEvent === "message_delta" && data.includes("stop_reason"))) {
    return isNonStreamingSseTerminalType(state.currentEvent);
  }
  try {
    const parsed = JSON.parse(data);
    const eventType = parsed && typeof parsed === "object" && typeof parsed.type === "string" ? parsed.type : state.currentEvent;
    return isNonStreamingSseTerminalType(eventType) || hasClaudeTerminalMessageDelta(parsed, eventType) || hasGeminiTerminalFinishReason(parsed);
  } catch {
    return false;
  }
}
function appendNonStreamingSseTerminalSignal(state, chunk) {
  const lines = `${state.pendingLine}${chunk}`.split(/\r?\n/);
  state.pendingLine = lines.pop() ?? "";
  for (const rawLine of lines) {
    if (processNonStreamingSseTerminalLine(state, rawLine)) return true;
  }
  return false;
}
export {
  appendNonStreamingSseTerminalSignal,
  convertNDJSONToSSE,
  isEventStreamAccepted,
  isTruthyStreamBody,
  normalizeNonStreamingEventPayload,
  parseNonStreamingSSEPayload,
  shouldTreatBufferedEventResponseAsExpected
};
