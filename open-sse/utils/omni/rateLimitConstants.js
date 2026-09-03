// ADAPTED STUB — OmniRoute `open-sse/config/constants.ts` exports
// `RateLimitReason` and `MAX_TOOLS_LIMIT`; OryphemRouter's config/constants.js
// barrel does not include them. Ported verbatim (values only).
export const RateLimitReason = {
  QUOTA_EXHAUSTED: "quota_exhausted", // Daily/monthly quota depleted
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded", // RPM/RPD limits hit
  MODEL_CAPACITY: "model_capacity", // Model overloaded (529, 503)
  SERVER_ERROR: "server_error", // 5xx errors
  AUTH_ERROR: "auth_error", // 401, 403
  UNKNOWN: "unknown",
};

export const MAX_TOOLS_LIMIT = 128;
