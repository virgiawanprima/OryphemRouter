import { HTTP_STATUS } from "../config/constants.js";
import { buildErrorBody, sanitizeErrorMessage } from "./errorSanitize.js";
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function hasNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function hasUsefulValue(value) {
  if (hasNonEmptyString(value)) return true;
  if (Array.isArray(value)) return value.some(hasUsefulValue);
  if (!isRecord(value)) return false;
  if (value.type === "compaction" && hasNonEmptyString(value.encrypted_content)) return true;
  for (const key of [
    "content",
    "text",
    "delta",
    "reasoning_content",
    "reasoning",
    // Mistral/Magistral thinking arrays and StepFun/OpenRouter reasoning_details are
    // valid model output — without these a reasoning-only stream was misclassified as
    // "no useful content" and turned into a spurious 502 (#2520).
    "thinking",
    "reasoning_details",
    "partial_json",
    "arguments",
    "name",
    "thought",
    "error",
    "executableCode",
    "codeExecutionResult"
  ]) {
    const candidate = value[key];
    if (hasNonEmptyString(candidate)) return true;
    if ((Array.isArray(candidate) || isRecord(candidate)) && hasUsefulValue(candidate)) return true;
  }
  for (const key of [
    "tool_calls",
    "tool_use",
    "function",
    "functionCall",
    "function_call",
    "function_call_output",
    "output",
    "content_block",
    "response",
    "choices",
    "candidates",
    "parts"
  ]) {
    if (hasUsefulValue(value[key])) return true;
  }
  return false;
}
function hasUsefulJsonPayload(payload) {
  if (!isRecord(payload)) return false;
  return hasUsefulValue(payload);
}
function isPingEventType(type) {
  return /^(?:ping|keepalive|heartbeat)$/i.test(type);
}
function getPayloadType(payload, eventType = "") {
  if (!isRecord(payload)) return eventType;
  const type = payload.type ?? payload.event ?? payload.object;
  return typeof type === "string" ? type : eventType;
}
const CONTENT_BEARING_KEYS = [
  "choices",
  "candidates",
  "content_block",
  "delta",
  "output",
  "response",
  "parts",
  "tool_calls",
  "tool_use",
  "function_call",
  "function_call_output"
];
function isErrorOnlyStructuredPayload(payload) {
  if (!("error" in payload)) return false;
  return !CONTENT_BEARING_KEYS.some((key) => key in payload);
}
function hasNonPingStructuredPayload(payload, eventType = "") {
  const type = getPayloadType(payload, eventType);
  if (isPingEventType(eventType) || isPingEventType(type)) return false;
  if (Array.isArray(payload)) return payload.length > 0;
  if (isRecord(payload)) {
    if (Object.keys(payload).length === 0) return false;
    return !isErrorOnlyStructuredPayload(payload);
  }
  return payload !== null && payload !== void 0;
}
function hasUsefulStreamContent(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (/^event:\s*(?:ping|keepalive)$/i.test(trimmed)) continue;
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      if (hasUsefulJsonPayload(JSON.parse(data))) return true;
    } catch {
      if (data.length > 0) return true;
    }
  }
  return false;
}
const LEGIT_EMPTY_TERMINAL_REASONS = /* @__PURE__ */ new Set([
  "length",
  "tool_calls",
  "content_filter",
  "max_tokens",
  "tool_use"
]);
const TERMINAL_REASON_PATTERN = /"(?:finish_reason|stop_reason)"\s*:\s*"([^"]+)"/g;
const SSE_FIELD_LINE = /(?:^|\r?\n)\s*(?:data|event):/;
function isSubstantiveErrorValue(value) {
  if (value === null || value === void 0) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if (hasNonEmptyString(record.message)) return true;
    return Object.keys(record).length > 0;
  }
  return value === true;
}
function frameHasStructuredStreamError(frame) {
  const lines = frame.split(/\r?\n/);
  let eventType = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (trimmed.startsWith("event:")) {
      eventType = trimmed.slice(6).trim();
      if (/^error$/i.test(eventType)) return true;
      continue;
    }
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (!isRecord(parsed)) continue;
      const type = getPayloadType(parsed, eventType);
      if (type === "error" || type === "response.failed" || eventType === "response.failed") {
        return true;
      }
      if (isSubstantiveErrorValue(parsed.error)) return true;
      const nestedResponse = isRecord(parsed.response) ? parsed.response : null;
      if (nestedResponse?.status === "failed" && nestedResponse.error != null) return true;
    } catch {
    }
  }
  return false;
}
function createStreamContentWatcher() {
  const MAX_BUFFERED = 64 * 1024;
  let pending = "";
  let content = false;
  let legitEmpty = false;
  let sse = false;
  let error = false;
  const inspect = (frame) => {
    if (!frame) return;
    if (!sse && SSE_FIELD_LINE.test(frame)) sse = true;
    if (!error && frameHasStructuredStreamError(frame)) error = true;
    if (!content && hasUsefulStreamContent(frame)) content = true;
    if (legitEmpty) return;
    for (const match of frame.matchAll(TERMINAL_REASON_PATTERN)) {
      if (LEGIT_EMPTY_TERMINAL_REASONS.has(match[1])) {
        legitEmpty = true;
        return;
      }
    }
  };
  return {
    note(text) {
      if (!text) return;
      pending += text;
      for (; ; ) {
        const boundary = pending.search(/\r?\n\r?\n/);
        if (boundary === -1) break;
        inspect(pending.slice(0, boundary));
        pending = pending.slice(boundary).replace(/^\r?\n\r?\n/, "");
      }
      if (pending.length > MAX_BUFFERED) {
        inspect(pending);
        pending = "";
      }
    },
    finish() {
      inspect(pending);
      pending = "";
    },
    sawContent: () => content,
    sawLegitEmptyTerminal: () => legitEmpty,
    sawSseFrame: () => sse,
    sawError: () => error
  };
}
function resetCurrentEvent(state) {
  state.currentEvent = "";
  state.dataLines = [];
}
function processStreamReadinessEvent(state) {
  const eventType = state.currentEvent;
  const data = state.dataLines.join("\n").trim();
  resetCurrentEvent(state);
  if (isPingEventType(eventType) || !data || data === "[DONE]") return false;
  try {
    const payload = JSON.parse(data);
    if (!state.upstreamDiagnostic && isRecord(payload) && isErrorOnlyStructuredPayload(payload)) {
      const error = payload.error;
      const rawMessage = typeof error === "string" ? error : isRecord(error) && typeof error.message === "string" ? error.message : "";
      const diagnostic = sanitizeErrorMessage(rawMessage).trim();
      if (diagnostic) state.upstreamDiagnostic = diagnostic;
    }
    return hasNonPingStructuredPayload(payload, eventType);
  } catch {
    return data.length > 0;
  }
}
function processStreamReadinessLine(state, line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    if (!trimmed) return processStreamReadinessEvent(state);
    return false;
  }
  if (trimmed.startsWith("event:")) {
    state.currentEvent = trimmed.slice(6).trim();
    return false;
  }
  if (trimmed.startsWith("data:")) {
    state.dataLines.push(trimmed.slice(5).trimStart());
  }
  return false;
}
function appendStreamReadinessSignal(state, chunk) {
  const lines = `${state.pendingLine}${chunk}`.split(/\r?\n/);
  state.pendingLine = lines.pop() ?? "";
  for (const line of lines) {
    if (processStreamReadinessLine(state, line)) return true;
  }
  return false;
}
function finishStreamReadinessSignal(state) {
  if (state.pendingLine && processStreamReadinessLine(state, state.pendingLine)) return true;
  state.pendingLine = "";
  return processStreamReadinessEvent(state);
}
function hasStreamReadinessSignal(text) {
  const state = {
    currentEvent: "",
    dataLines: [],
    pendingLine: "",
    upstreamDiagnostic: null
  };
  if (appendStreamReadinessSignal(state, text)) return true;
  return finishStreamReadinessSignal(state);
}
function createErrorResponse(status, message, code, type, upstreamDiagnostic) {
  return new Response(
    JSON.stringify(
      buildErrorBody(
        status,
        message,
        upstreamDiagnostic ? { error: { message: upstreamDiagnostic } } : void 0,
        { code, type }
      )
    ),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function prependBufferedChunks(chunks, reader) {
  return new ReadableStream({
    async start(controller) {
      try {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {
      });
      reader.releaseLock();
    }
  });
}
function readWithTimeout(reader, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("STREAM_READINESS_TIMEOUT")), timeoutMs);
    reader.read().then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
async function ensureStreamReadiness(response, options) {
  if (!response.body || options.timeoutMs <= 0) return { ok: true, response };
  const reader = response.body.getReader();
  const chunks = [];
  const decoder = new TextDecoder();
  const readinessState = {
    currentEvent: "",
    dataLines: [],
    pendingLine: "",
    upstreamDiagnostic: null
  };
  const startedAt = Date.now();
  const effectiveTimeoutMs = Math.max(0, Math.floor(options.timeoutMs));
  const deadline = startedAt + effectiveTimeoutMs;
  let handedOffReader = false;
  const buildReadyResponse = () => new Response(prependBufferedChunks(chunks, reader), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
  const timeoutReason = () => `Stream produced no non-ping SSE event within ${effectiveTimeoutMs}ms`;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        const reason = timeoutReason();
        options.log?.warn?.(
          "STREAM",
          `${reason} (${options.provider || "provider"}/${options.model || "unknown"})`
        );
        await reader.cancel(reason).catch(() => {
        });
        return {
          ok: false,
          reason,
          classificationReason: reason,
          code: "STREAM_READINESS_TIMEOUT",
          type: "stream_timeout",
          response: createErrorResponse(
            HTTP_STATUS.GATEWAY_TIMEOUT,
            reason,
            "STREAM_READINESS_TIMEOUT",
            "stream_timeout"
          )
        };
      }
      let readResult;
      try {
        readResult = await readWithTimeout(reader, remainingMs);
      } catch {
        const reason = timeoutReason();
        options.log?.warn?.(
          "STREAM",
          `${reason} (${options.provider || "provider"}/${options.model || "unknown"})`
        );
        await reader.cancel(reason).catch(() => {
        });
        return {
          ok: false,
          reason,
          classificationReason: reason,
          code: "STREAM_READINESS_TIMEOUT",
          type: "stream_timeout",
          response: createErrorResponse(
            HTTP_STATUS.GATEWAY_TIMEOUT,
            reason,
            "STREAM_READINESS_TIMEOUT",
            "stream_timeout"
          )
        };
      }
      if (readResult.done) {
        const tail = decoder.decode(void 0, { stream: false });
        if (tail && appendStreamReadinessSignal(readinessState, tail)) {
          handedOffReader = true;
          return { ok: true, response: buildReadyResponse() };
        }
        if (finishStreamReadinessSignal(readinessState)) {
          handedOffReader = true;
          return { ok: true, response: buildReadyResponse() };
        }
        const classificationReason = "Stream ended before producing a non-ping SSE event";
        const upstreamDiagnostic = readinessState.upstreamDiagnostic || void 0;
        const reason = upstreamDiagnostic ? `${classificationReason}: ${upstreamDiagnostic}` : classificationReason;
        options.log?.warn?.(
          "STREAM",
          `${reason} (${options.provider || "provider"}/${options.model || "unknown"})`
        );
        return {
          ok: false,
          reason,
          classificationReason,
          ...upstreamDiagnostic ? { upstreamDiagnostic } : {},
          code: "STREAM_EARLY_EOF",
          type: "stream_early_eof",
          response: createErrorResponse(
            HTTP_STATUS.BAD_GATEWAY,
            classificationReason,
            "STREAM_EARLY_EOF",
            "stream_early_eof",
            upstreamDiagnostic
          )
        };
      }
      if (!readResult.value) continue;
      chunks.push(readResult.value);
      const decodedChunk = decoder.decode(readResult.value, { stream: true });
      if (appendStreamReadinessSignal(readinessState, decodedChunk)) {
        options.log?.debug?.(
          "STREAM",
          `Stream readiness confirmed in ${Date.now() - startedAt}ms (${options.provider || "provider"}/${options.model || "unknown"})`
        );
        handedOffReader = true;
        return {
          ok: true,
          response: buildReadyResponse()
        };
      }
    }
  } finally {
    if (!handedOffReader) {
      reader.releaseLock();
    }
  }
}
export {
  createStreamContentWatcher,
  ensureStreamReadiness,
  frameHasStructuredStreamError,
  hasStreamReadinessSignal,
  hasUsefulStreamContent
};
