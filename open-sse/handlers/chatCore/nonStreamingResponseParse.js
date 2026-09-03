import { normalizePayloadForLog } from "../../utils/omni/logPayloads.js";
import { extractSSEErrorMessage } from "../sseParser.js";
import { readNonStreamingResponseBody } from "./nonStreamingResponseBody.js";
import {
  normalizeNonStreamingEventPayload,
  parseNonStreamingSSEPayload,
  shouldTreatBufferedEventResponseAsExpected
} from "./nonStreamingSse.js";
function isJsonRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function parseNonStreamingResponseBody(opts) {
  const { providerResponse, upstreamStream, providerHeaders, finalBody, targetFormat, model, log } = opts;
  const contentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  const rawBody = await readNonStreamingResponseBody(providerResponse, contentType, upstreamStream);
  const normalizedProviderPayload = normalizePayloadForLog(rawBody);
  const looksLikeSSE = contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson") || /(^|\n)\s*(event|data):/m.test(rawBody);
  if (looksLikeSSE) {
    const streamPayload = normalizeNonStreamingEventPayload(rawBody, contentType);
    const streamKind = contentType.includes("application/x-ndjson") ? "NDJSON" : "SSE";
    if (shouldTreatBufferedEventResponseAsExpected(upstreamStream, providerHeaders, finalBody)) {
      log?.debug?.(
        "STREAM",
        `Buffering upstream ${streamKind} response for non-streaming client request`
      );
    } else {
      log?.warn?.(
        "STREAM",
        `Unexpected ${streamKind} response for non-streaming request \u2014 buffering`
      );
    }
    const parsedFromSSE = parseNonStreamingSSEPayload(streamPayload, targetFormat, model);
    if (!parsedFromSSE) {
      const surfacedSseError = extractSSEErrorMessage(streamPayload);
      const invalidSseMessage = surfacedSseError || "Invalid SSE response for non-streaming request";
      return {
        kind: "invalid_sse",
        message: invalidSseMessage,
        looksLikeSSE: true,
        normalizedProviderPayload
      };
    }
    return {
      kind: "ok",
      responseBody: parsedFromSSE.body,
      responsePayloadFormat: parsedFromSSE.format,
      looksLikeSSE: true,
      normalizedProviderPayload
    };
  }
  try {
    const responseBody = rawBody ? JSON.parse(rawBody) : {};
    if (!isJsonRecord(responseBody)) {
      return {
        kind: "invalid_json",
        message: "Invalid JSON response from provider",
        detailedError: "Invalid JSON response from provider: expected an object payload",
        looksLikeSSE: false,
        normalizedProviderPayload
      };
    }
    return {
      kind: "ok",
      responseBody,
      responsePayloadFormat: targetFormat,
      looksLikeSSE: false,
      normalizedProviderPayload
    };
  } catch (err) {
    const detailedError = `Invalid JSON response from provider (error: ${err instanceof Error ? err.message : String(err)}): ${rawBody.substring(0, 1e3)}`;
    const invalidJsonMessage = "Invalid JSON response from provider";
    return {
      kind: "invalid_json",
      message: invalidJsonMessage,
      detailedError,
      looksLikeSSE: false,
      normalizedProviderPayload
    };
  }
}
export {
  isJsonRecord,
  parseNonStreamingResponseBody
};
