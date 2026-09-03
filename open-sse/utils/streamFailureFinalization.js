import {
  finalizeMostRecentPendingRequest,
  finalizePendingRequestById
} from "./omni/usageHistory.js";
import { HTTP_STATUS } from "../config/constants.js";
import { buildErrorBody } from "./errorSanitize.js";
import { log } from "./log.js";
function createClientDisconnectGraceHandler({
  isStreamCompletionRecorded,
  gracePeriodMs,
  finalize,
  pollIntervalMs = 250,
  setTimeoutFn = setTimeout
}) {
  return (event) => {
    if (isStreamCompletionRecorded()) return true;
    if (gracePeriodMs <= 0) {
      finalize(event);
      return true;
    }
    const deadline = Date.now() + gracePeriodMs;
    const poll = () => {
      if (isStreamCompletionRecorded()) return;
      if (Date.now() >= deadline) {
        finalize(event);
        return;
      }
      setTimeoutFn(poll, pollIntervalMs);
    };
    setTimeoutFn(poll, pollIntervalMs);
    return true;
  };
}
function finalizeStreamRequestLog({
  pendingRequestId,
  model,
  provider,
  connectionId,
  providerResponse,
  clientResponse,
  status,
  error,
  errorCode,
  onWarn
}) {
  try {
    const completedById = finalizePendingRequestById(pendingRequestId, {
      providerResponse,
      clientResponse,
      status,
      error: error || null,
      errorCode: errorCode || null
    });
    if (!completedById) {
      finalizeMostRecentPendingRequest(model, provider, connectionId, {
        providerResponse,
        clientResponse,
        status,
        error: error || null,
        errorCode: errorCode || null
      });
    }
  } catch (error2) {
    try {
      if (onWarn) {
        onWarn(error2);
      } else {
        log.warn(
          "STREAM_FINALIZE",
          "finalizeMostRecentPendingRequest failed:",
          error2 && typeof error2 === "object" && "message" in error2 ? error2.message : error2
        );
      }
    } catch {
    }
  }
}
function createStreamFailureFinalizers({
  isFailureCompletionRecorded,
  isStreamCompletionRecorded = () => false,
  onStreamComplete,
  persistFailureUsage,
  onStreamFailure
}) {
  const handleStreamFailure = (failure) => {
    if (isStreamCompletionRecorded()) {
      return true;
    }
    const status = failure.status || HTTP_STATUS.BAD_GATEWAY;
    const message = failure.message || "Upstream stream error";
    const code = failure.code || failure.type || String(status);
    const classification = failure.code || failure.type ? { code: failure.code, type: failure.type } : void 0;
    if (!isFailureCompletionRecorded()) {
      const errorBody = buildErrorBody(status, message, void 0, classification);
      onStreamComplete({
        status,
        usage: null,
        responseBody: errorBody,
        providerPayload: errorBody,
        clientPayload: errorBody,
        error: message,
        errorCode: code,
        ttft: 0
      });
    }
    persistFailureUsage(status, code);
    try {
      onStreamFailure?.(failure);
    } catch {
    }
    return true;
  };
  const isClientClosedPipelineError = (message, statusCode) => {
    const normalized = message.toLowerCase();
    return statusCode === 499 || normalized.includes("responseaborted") || normalized.includes("controller is already closed") || normalized.includes("readablestream is closed") || normalized.includes("writablestream is closed") || normalized.includes("aborterror");
  };
  let pipelineStreamFailureFinalized = false;
  const onPipelineStreamError = ({ message, statusCode }) => {
    if (pipelineStreamFailureFinalized) return true;
    pipelineStreamFailureFinalized = true;
    const normalizedMessage = message || "Upstream stream error";
    const clientClosed = isClientClosedPipelineError(normalizedMessage, statusCode);
    const status = clientClosed ? 499 : Number.isFinite(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : HTTP_STATUS.BAD_GATEWAY;
    const code = clientClosed ? "client_disconnected" : normalizedMessage.toLowerCase().includes("terminated") ? "stream_terminated" : "stream_pipeline_error";
    const type = clientClosed ? "client_disconnected" : "stream_error";
    handleStreamFailure({
      status,
      message: normalizedMessage,
      code,
      type
    });
    return true;
  };
  return { handleStreamFailure, onPipelineStreamError };
}
export {
  createClientDisconnectGraceHandler,
  createStreamFailureFinalizers,
  finalizeStreamRequestLog
};
