/**
 * ADAPTED — OmniRoute's utils/error.ts also exports createErrorResult().
 * OryphemRouter's ported errorSanitize.js lacks it. Faithful port with a
 * minimal local passthrough-error builder (buildPassthroughErrorResponse lived
 * in utils/upstreamErrorPassthrough.ts, not present here).
 *
 * unified by integration — errorExtras.js is the canonical error-facade for
 * open-sse/utils/omni and exports BOTH named imports its consumers need:
 * `createErrorResult` (handlers/chatCore/modelLifecyclePolicy.js) and
 * `sanitizeUpstreamDetails` (handlers/imageGeneration.js).
 */
import { buildErrorBody } from "../../utils/errorSanitize.js";

function localPassthroughErrorResponse(statusCode, upstreamDetails, extraHeaders) {
  try {
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    const body =
      upstreamDetails && typeof upstreamDetails === "object"
        ? JSON.stringify(upstreamDetails)
        : JSON.stringify({ error: { message: String(upstreamDetails || "") } });
    return new Response(body, { status: statusCode, headers });
  } catch {
    return null;
  }
}

export function createErrorResult(
  statusCode,
  message,
  retryAfterMs = null,
  errorCode,
  errorType,
  upstreamDetails,
  opts = {}
) {
  const body = buildErrorBody(statusCode, message, upstreamDetails);
  if (errorCode) body.error.code = errorCode;
  if (errorType) body.error.type = errorType;
  const result = {
    success: false,
    status: statusCode,
    error: body.error.message,
    rawMessage: message,
    errorType,
    errorCode,
    response: new Response(JSON.stringify(body), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    }),
  };
  if (retryAfterMs) result.retryAfterMs = retryAfterMs;
  if (opts?.passthrough) {
    const passthroughResponse = localPassthroughErrorResponse(
      statusCode,
      upstreamDetails,
      retryAfterMs ? { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } : undefined
    );
    if (passthroughResponse) result.response = passthroughResponse;
  }
  return result;
}
export default { createErrorResult };

// sanitizeUpstreamDetails — faithful port from OmniRoute utils/error.ts.
const BLOCKED_KEYS = /stack|trace|path|file|cwd|dir|password|secret|token|key|authorization|cookie/i;
const MAX_DEPTH = 4;
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";

export function sanitizeUpstreamDetails(value, depth = 0) {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeErrorMessage(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((v) => sanitizeUpstreamDetails(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (BLOCKED_KEYS.test(k)) continue;
      out[k] = sanitizeUpstreamDetails(v, depth + 1);
    }
    return out;
  }
  return null;
}
