const RATE_LIMIT_EXECUTION_TIMEOUT_CODE = "RATE_LIMIT_EXECUTION_TIMEOUT";
const RATE_LIMIT_QUEUE_FULL_CODE = "RATE_LIMIT_QUEUE_FULL";
const RATE_LIMIT_QUEUE_WEDGED_CODE = "RATE_LIMIT_QUEUE_WEDGED";
const LEGACY_RATE_LIMIT_QUEUE_TIMEOUT_CODE = "RATE_LIMIT_QUEUE_TIMEOUT";
const localRateLimitErrors = /* @__PURE__ */ new WeakMap();
const localRateLimitResponses = /* @__PURE__ */ new WeakMap();
function getStatusForCode(code) {
  switch (code) {
    case RATE_LIMIT_QUEUE_FULL_CODE:
      return 429;
    case RATE_LIMIT_EXECUTION_TIMEOUT_CODE:
      return 504;
    case RATE_LIMIT_QUEUE_WEDGED_CODE:
    case LEGACY_RATE_LIMIT_QUEUE_TIMEOUT_CODE:
      return 503;
  }
}
function markLocalRateLimitError(error, code) {
  const failure = Object.freeze({ code, status: getStatusForCode(code) });
  localRateLimitErrors.set(error, failure);
  const branded = error;
  branded.code = failure.code;
  branded.status = failure.status;
  return branded;
}
function getTrustedLocalRateLimitError(error) {
  if (!error || typeof error !== "object" && typeof error !== "function") return null;
  return localRateLimitErrors.get(error) ?? null;
}
function getClientSafeLocalRateLimitError(error) {
  const failure = getTrustedLocalRateLimitError(error);
  if (!failure) return null;
  return {
    ...failure,
    message: error instanceof Error ? error.message : "Local rate-limit failure"
  };
}
function markTrustedLocalRateLimitResponse(response, error) {
  const failure = getTrustedLocalRateLimitError(error);
  if (failure) localRateLimitResponses.set(response, failure);
  return response;
}
function getTrustedLocalRateLimitResponse(response) {
  return localRateLimitResponses.get(response) ?? null;
}
function inheritTrustedLocalRateLimitResponse(source, target) {
  const failure = localRateLimitResponses.get(source);
  if (failure) localRateLimitResponses.set(target, failure);
  return target;
}
export {
  LEGACY_RATE_LIMIT_QUEUE_TIMEOUT_CODE,
  RATE_LIMIT_EXECUTION_TIMEOUT_CODE,
  RATE_LIMIT_QUEUE_FULL_CODE,
  RATE_LIMIT_QUEUE_WEDGED_CODE,
  getClientSafeLocalRateLimitError,
  getTrustedLocalRateLimitError,
  getTrustedLocalRateLimitResponse,
  inheritTrustedLocalRateLimitResponse,
  markLocalRateLimitError,
  markTrustedLocalRateLimitResponse
};
