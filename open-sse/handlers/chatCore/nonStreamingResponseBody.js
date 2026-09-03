import { withBodyTimeout } from "../../utils/omni/streamExtras.js";
import { FETCH_BODY_TIMEOUT_MS } from "../../utils/omni/omniConstants.js";
import { createBodyTimeoutError, readStreamChunkWithTimeout } from "./upstreamTimeouts.js";
import {
  appendNonStreamingSseTerminalSignal
} from "./nonStreamingSse.js";
class NonStreamingResponseTooLargeError extends Error {
  bytesSeen;
  maxBytes;
  constructor(bytesSeen, maxBytes) {
    super(
      `Upstream non-streaming response exceeded the ${maxBytes}-byte cap (saw at least ${bytesSeen} bytes)`
    );
    this.name = "NonStreamingResponseTooLargeError";
    this.bytesSeen = bytesSeen;
    this.maxBytes = maxBytes;
  }
}
const DEFAULT_MAX_NONSTREAMING_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_NONSTREAMING_RESPONSE_BYTES = (() => {
  const parsed = Number.parseInt(String(process.env.OMNIROUTE_MAX_NONSTREAMING_RESPONSE_BYTES), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_NONSTREAMING_RESPONSE_BYTES;
})();
async function readNonStreamingResponseBody(response, contentType, upstreamStream, maxBytes = MAX_NONSTREAMING_RESPONSE_BYTES) {
  if (!upstreamStream || !response.body || !contentType.includes("text/event-stream") && !contentType.includes("application/x-ndjson")) {
    const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new NonStreamingResponseTooLargeError(declared, maxBytes);
    }
    return withBodyTimeout(response.text());
  }
  return drainNonStreamingSseBody(response.body, maxBytes);
}
function cancelNonStreamingReader(reader, reason) {
  try {
    void reader.cancel(reason).catch(() => {
    });
  } catch {
  }
}
async function readNextNonStreamingChunk(reader, deadline) {
  const timeoutMs = deadline > 0 ? deadline - Date.now() : 0;
  if (deadline > 0 && timeoutMs <= 0) {
    throw createBodyTimeoutError(FETCH_BODY_TIMEOUT_MS);
  }
  const { done, value } = await readStreamChunkWithTimeout(reader, timeoutMs);
  if (done) return { kind: "done" };
  if (!value) return { kind: "skip" };
  return { kind: "chunk", value };
}
async function drainNonStreamingSseBody(body, maxBytes) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const terminalState = {
    currentEvent: "",
    pendingLine: ""
  };
  let rawBody = "";
  let bytesSeen = 0;
  const deadline = FETCH_BODY_TIMEOUT_MS > 0 ? Date.now() + FETCH_BODY_TIMEOUT_MS : 0;
  let cancelRequested = false;
  const requestCancel = (reason) => {
    if (cancelRequested) return;
    cancelRequested = true;
    cancelNonStreamingReader(reader, reason);
  };
  try {
    while (true) {
      const next = await readNextNonStreamingChunk(reader, deadline);
      if (next.kind === "done") break;
      if (next.kind === "skip") continue;
      bytesSeen += next.value.byteLength;
      if (bytesSeen > maxBytes) {
        requestCancel("non-streaming response exceeded byte cap");
        throw new NonStreamingResponseTooLargeError(bytesSeen, maxBytes);
      }
      const decodedChunk = decoder.decode(next.value, { stream: true });
      rawBody += decodedChunk;
      if (appendNonStreamingSseTerminalSignal(terminalState, decodedChunk)) {
        requestCancel("non-streaming bridge consumed terminal SSE event");
        break;
      }
    }
  } catch (error) {
    requestCancel(error);
    throw error;
  } finally {
    rawBody += decoder.decode();
    reader.releaseLock();
  }
  return rawBody;
}
export {
  MAX_NONSTREAMING_RESPONSE_BYTES,
  NonStreamingResponseTooLargeError,
  readNonStreamingResponseBody
};
