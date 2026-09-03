import { buildErrorBody } from "./errorSanitize.js";
import { buildStreamSummaryFromEvents } from "./streamPayloadCollector.js";
function rejectEmptyChoicesStream(ctx) {
  if (ctx.forwardedValuableChunk || ctx.hasValidUsage) return false;
  const error = new Error(
    "Provider returned empty content \u2014 stream forwarded no valuable chunks"
  );
  error.statusCode = 502;
  error.code = "empty_content";
  if (ctx.onFailure) {
    try {
      ctx.onFailure({ status: 502, message: error.message, code: "empty_content" });
    } catch {
    }
  }
  const errorBody = buildErrorBody(502, error.message);
  if (ctx.onComplete) {
    try {
      ctx.onComplete({
        status: 502,
        usage: ctx.usage,
        responseBody: errorBody,
        error: error.message,
        errorCode: "empty_content",
        providerPayload: ctx.providerPayloadCollector.build(
          buildStreamSummaryFromEvents(
            ctx.providerPayloadCollector.getEvents(),
            ctx.targetFormat,
            ctx.model
          ),
          { includeEvents: false }
        ),
        clientPayload: ctx.clientPayloadCollector.build(errorBody, { includeEvents: false })
      });
    } catch {
    }
  }
  ctx.clearPendingRequestFromStream?.();
  return true;
}
function buildEmptyChoicesStreamError() {
  const error = new Error(
    "Provider returned empty content \u2014 stream forwarded no valuable chunks"
  );
  error.statusCode = 502;
  error.code = "empty_content";
  return error;
}
export {
  buildEmptyChoicesStreamError,
  rejectEmptyChoicesStream
};
