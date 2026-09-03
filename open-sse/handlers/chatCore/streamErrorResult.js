import { buildErrorBody } from "../../utils/errorSanitize.js";
function isSemaphoreCapacityError(error) {
  return !!error && typeof error === "object" && (error.code === "SEMAPHORE_TIMEOUT" || error.code === "SEMAPHORE_QUEUE_FULL");
}
function createStreamingErrorResult(statusCode, message, code, type) {
  const errorBody = buildErrorBody(statusCode, message);
  if (code) {
    errorBody.error.code = code;
  }
  if (type) {
    errorBody.error.type = type;
  }
  const body = `data: ${JSON.stringify(errorBody)}

data: [DONE]

`;
  return {
    success: false,
    status: statusCode,
    error: message,
    response: new Response(body, {
      status: statusCode,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    })
  };
}
function getUpstreamErrorIdentifier(error) {
  if (!error || typeof error !== "object") return void 0;
  const value = error.code;
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
export {
  createStreamingErrorResult,
  getUpstreamErrorIdentifier,
  isSemaphoreCapacityError
};
