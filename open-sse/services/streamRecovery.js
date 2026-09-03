import { STREAM_RECOVERY } from "../utils/omni/streamRecoveryConfig.js";
import {
  createThroughputWatchdog,
  ThroughputWatchdogError
} from "./throughputWatchdog.js";
import { ThroughputWatchdogError as ThroughputWatchdogError2 } from "./throughputWatchdog.js";
class TruncatedStreamError extends Error {
  constructor(message = "Provider stream ended without a terminal marker") {
    super(message);
    this.name = "TruncatedStreamError";
  }
}
class HoldbackBuffer {
  chunks = [];
  bytes = 0;
  startedAt = null;
  holdbackMs;
  maxBytes;
  now;
  committed = false;
  constructor(options = {}) {
    this.holdbackMs = options.holdbackMs ?? STREAM_RECOVERY.HOLDBACK_MS;
    this.maxBytes = options.maxBytes ?? STREAM_RECOVERY.BUFFER_MAX_BYTES;
    this.now = options.now ?? (() => Date.now());
  }
  /**
   * Buffer `chunk` until the holdback window elapses or the byte cap is reached.
   * Returns the chunks to emit downstream now: `[]` while still holding, or every
   * buffered chunk (the just-pushed one included) at the moment of commit. After
   * commit, chunks pass straight through.
   */
  push(chunk) {
    if (this.committed) return [chunk];
    if (this.startedAt === null) this.startedAt = this.now();
    this.chunks.push(chunk);
    this.bytes += chunk.byteLength;
    if (this.bytes >= this.maxBytes || this.now() - this.startedAt >= this.holdbackMs) {
      return this.flush();
    }
    return [];
  }
  /** Commit and return everything held so far. */
  flush() {
    if (this.committed) return [];
    this.committed = true;
    const out = this.chunks;
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = null;
    return out;
  }
  /** Drop held chunks WITHOUT committing — used before a transparent retry. */
  discard() {
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = null;
  }
  get hasBuffered() {
    return this.chunks.length > 0;
  }
  /** Concatenated view of the currently-held (uncommitted) chunks, for inspection. */
  peekBuffered() {
    if (this.chunks.length === 0) return new Uint8Array(0);
    if (this.chunks.length === 1) return this.chunks[0];
    const out = new Uint8Array(this.bytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}
const RETRYABLE_TRANSPORT_CODES = /* @__PURE__ */ new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "ENETUNREACH",
  "EHOSTUNREACH"
]);
const RETRYABLE_ERROR_NAMES = /* @__PURE__ */ new Set(["TimeoutError", "BodyTimeoutError"]);
function isRetryableStreamError(error) {
  if (error instanceof TruncatedStreamError || error instanceof ThroughputWatchdogError) {
    return true;
  }
  if (!error || typeof error !== "object") return false;
  const name = error.name;
  if (name === "AbortError" || name === "ResponseAborted") return false;
  if (typeof name === "string" && RETRYABLE_ERROR_NAMES.has(name)) return true;
  const code = error.code;
  if (typeof code === "string") {
    if (RETRYABLE_TRANSPORT_CODES.has(code)) return true;
    if (code.startsWith("UND_ERR_")) return true;
  }
  const message = error.message;
  if (typeof message === "string" && /terminated|socket hang up|econnreset/i.test(message)) {
    return true;
  }
  return false;
}
const OPENAI_DONE_MARKER = "[DONE]";
const ANTHROPIC_STOP_MARKER = "message_stop";
function hasTerminalMarker(bytes) {
  if (!bytes || bytes.byteLength === 0) return false;
  const text = new TextDecoder().decode(bytes);
  return text.includes(OPENAI_DONE_MARKER) || text.includes(ANTHROPIC_STOP_MARKER);
}
function scanOpenAiSseText(sse) {
  let text = "";
  let reasoningText = "";
  let sawToolCall = false;
  let toolCallFinished = false;
  let terminal = false;
  let finishReason = null;
  let parsedOpenAi = false;
  if (typeof sse !== "string" || sse.length === 0) {
    return {
      text,
      reasoningText,
      sawToolCall,
      sawToolCallInFlight: false,
      terminal,
      finishReason,
      parsedOpenAi
    };
  }
  for (const line of sse.split("\n")) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    if (payload === "[DONE]") {
      terminal = true;
      continue;
    }
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    const choices = json?.choices;
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      const delta = choice?.delta;
      if (delta && typeof delta === "object") {
        parsedOpenAi = true;
        const content = delta.content;
        if (typeof content === "string") text += content;
        const reasoning = delta.reasoning_content;
        if (typeof reasoning === "string") reasoningText += reasoning;
        const toolCalls = delta.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) sawToolCall = true;
      }
      const rawFinishReason = choice?.finish_reason;
      if (rawFinishReason === "tool_calls") {
        toolCallFinished = true;
        finishReason = "tool_calls";
      } else if (rawFinishReason != null) {
        terminal = true;
        if (typeof rawFinishReason === "string") finishReason = rawFinishReason;
      }
    }
  }
  const sawToolCallInFlight = sawToolCall && !toolCallFinished;
  return {
    text,
    reasoningText,
    sawToolCall,
    sawToolCallInFlight,
    terminal,
    finishReason,
    parsedOpenAi
  };
}
function makeContinuationBody(body, assistantSoFar) {
  if (!body || typeof body !== "object") return null;
  if (!Array.isArray(body.messages) || body.messages.length === 0) return null;
  if (typeof assistantSoFar !== "string") return null;
  return {
    ...body,
    messages: assistantSoFar.length > 0 ? [...body.messages, { role: "assistant", content: assistantSoFar }] : [...body.messages],
    stream: true
  };
}
function trimContinuationOverlap(emitted, continuation) {
  if (!continuation) return "";
  if (!emitted) return continuation;
  const max = Math.min(emitted.length, continuation.length, 512);
  for (let k = max; k > 0; k--) {
    if (emitted.endsWith(continuation.slice(0, k))) return continuation.slice(k);
  }
  return continuation;
}
function createRecoverableStream(initialStream, reopen, options) {
  const maxRetries = options.maxEarlyRetries ?? STREAM_RECOVERY.EARLY_RETRY_MAX;
  let reader = initialStream.getReader();
  let holdback = new HoldbackBuffer({ now: options.now });
  let retries = 0;
  let finalized = false;
  let cancelled = false;
  let throughputWatchdog = createThroughputWatchdog(options.throughputWatchdog);
  const runFinalize = () => {
    if (finalized) return;
    finalized = true;
    options.finalize();
  };
  const tryReopen = async (error) => {
    if (cancelled || retries >= maxRetries) return false;
    retries += 1;
    options.onRetry?.(retries, error);
    try {
      await reader.cancel(error);
    } catch {
    }
    let next = null;
    try {
      next = await reopen();
    } catch {
      next = null;
    }
    if (!next) return false;
    reader = next.getReader();
    holdback.discard();
    throughputWatchdog = createThroughputWatchdog(options.throughputWatchdog);
    return true;
  };
  const continueEnabled = typeof options.continueStream === "function";
  const maxContinuations = options.maxContinuations ?? STREAM_RECOVERY.EARLY_RETRY_MAX;
  const encoder = new TextEncoder();
  const trackDecoder = new TextDecoder();
  let continuations = 0;
  let emittedTail = "";
  let emittedText = "";
  let emittedReasoningText = "";
  let emittedFinishReason = null;
  let emittedTerminal = false;
  let emittedToolCallInFlight = false;
  let emittedSawToolCall = false;
  let emittedParsedOpenAi = false;
  const emit = (controller, chunk) => {
    controller.enqueue(chunk);
    if (!continueEnabled) return;
    emittedTail += trackDecoder.decode(chunk, { stream: true });
    const boundary = emittedTail.lastIndexOf("\n\n");
    if (boundary < 0) return;
    const complete = emittedTail.slice(0, boundary + 2);
    emittedTail = emittedTail.slice(boundary + 2);
    const scan = scanOpenAiSseText(complete);
    emittedText += scan.text;
    emittedReasoningText += scan.reasoningText;
    if (scan.finishReason !== null) emittedFinishReason = scan.finishReason;
    if (scan.terminal) emittedTerminal = true;
    if (scan.sawToolCallInFlight) emittedToolCallInFlight = true;
    if (scan.sawToolCall) emittedSawToolCall = true;
    if (scan.parsedOpenAi) emittedParsedOpenAi = true;
  };
  const flushHeld = (controller) => {
    for (const chunk of holdback.flush()) emit(controller, chunk);
  };
  const hallucinatedEmptyStop = () => emittedFinishReason === "stop" && !emittedSawToolCall && emittedText.length === 0 && emittedReasoningText.length > 0;
  const canContinue = () => continueEnabled && continuations < maxContinuations && emittedParsedOpenAi && !emittedToolCallInFlight && (emittedText.length > 0 ? !emittedTerminal : hallucinatedEmptyStop());
  const emitCleanTerminal = (controller) => {
    controller.enqueue(
      encoder.encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n')
    );
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  };
  const tryContinue = async (controller) => {
    if (!canContinue()) return false;
    continuations += 1;
    options.onContinue?.(continuations, emittedText);
    let contStream = null;
    try {
      contStream = await options.continueStream(emittedText);
    } catch {
      contStream = null;
    }
    if (!contStream) return false;
    const contReader = contStream.getReader();
    const contDecoder = new TextDecoder();
    let raw = "";
    for (; ; ) {
      let r;
      try {
        r = await contReader.read();
      } catch {
        break;
      }
      if (r.done) break;
      if (r.value) raw += contDecoder.decode(r.value, { stream: true });
    }
    const scan = scanOpenAiSseText(raw);
    const overlapResult = trimContinuationOverlap(emittedText, scan.text);
    const overlapChars = scan.text.length - overlapResult.length;
    const isSuspectedRestart = emittedText.length > 0 && scan.text.length > 0 && overlapChars < STREAM_RECOVERY.MIN_CONTINUATION_OVERLAP_CHARS;
    if (isSuspectedRestart) {
      if (await tryContinue(controller)) return true;
      emitCleanTerminal(controller);
      return true;
    }
    const suffix = overlapResult;
    if (suffix) {
      emit(
        controller,
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: suffix } }] })}

`
        )
      );
    }
    if (scan.terminal || scan.sawToolCall) {
      emitCleanTerminal(controller);
      return true;
    }
    if (await tryContinue(controller)) return true;
    emitCleanTerminal(controller);
    return true;
  };
  return new ReadableStream({
    async pull(controller) {
      for (; ; ) {
        let result;
        try {
          result = await reader.read();
        } catch (error) {
          if (cancelled) return;
          if (holdback.committed) {
            if (isRetryableStreamError(error) && await tryContinue(controller)) {
              runFinalize();
              controller.close();
              return;
            }
            runFinalize();
            controller.error(error);
            return;
          }
          if (isRetryableStreamError(error) && await tryReopen(error)) {
            continue;
          }
          flushHeld(controller);
          runFinalize();
          controller.close();
          return;
        }
        if (cancelled) return;
        const { done, value } = result;
        if (done) {
          if (holdback.committed) {
            if (await tryContinue(controller)) {
              runFinalize();
              controller.close();
              return;
            }
            runFinalize();
            controller.close();
            return;
          }
          if (hasTerminalMarker(holdback.peekBuffered())) {
            flushHeld(controller);
            runFinalize();
            controller.close();
            return;
          }
          if (await tryReopen(new TruncatedStreamError())) {
            continue;
          }
          flushHeld(controller);
          runFinalize();
          controller.close();
          return;
        }
        if (value === void 0) continue;
        const watchdogDecision = throughputWatchdog.observe(value);
        if (watchdogDecision.abort) {
          const error = new ThroughputWatchdogError();
          options.onWatchdogAbort?.(error);
          if (!holdback.committed && await tryReopen(error)) continue;
          if (holdback.committed) {
            try {
              await reader.cancel(error);
            } catch {
            }
            if (await tryContinue(controller)) {
              runFinalize();
              controller.close();
              return;
            }
            runFinalize();
            controller.error(error);
            return;
          }
          flushHeld(controller);
          runFinalize();
          controller.close();
          return;
        }
        if (holdback.committed) {
          emit(controller, value);
          return;
        }
        const emitted = holdback.push(value);
        if (emitted.length > 0) {
          for (const chunk of emitted) emit(controller, chunk);
          return;
        }
      }
    },
    async cancel(reason) {
      cancelled = true;
      runFinalize();
      try {
        await reader.cancel(reason);
      } catch {
      }
    }
  });
}
export {
  HoldbackBuffer,
  ThroughputWatchdogError2 as ThroughputWatchdogError,
  TruncatedStreamError,
  createRecoverableStream,
  hasTerminalMarker,
  isRetryableStreamError,
  makeContinuationBody,
  scanOpenAiSseText,
  trimContinuationOverlap
};
