import {
  isAccountDeactivated,
  isCreditsExhausted,
  isDailyQuotaExhausted,
  isOAuthInvalidToken
} from "../utils/omni/accountFallbackClassifier.js";
import { isSubscriptionQuotaText } from "./quotaTextCooldowns.js";
import { getProviderCategory, getRegistryEntry } from "../config/providerRegistry.js";
const LEGIT_EMPTY_CLAUDE_STOP = /* @__PURE__ */ new Set(["max_tokens", "tool_use"]);
const LEGIT_EMPTY_OPENAI_FINISH = /* @__PURE__ */ new Set(["length", "tool_calls", "content_filter"]);
function isEmptyContentResponse(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return false;
  const body = responseBody;
  if (Array.isArray(body.choices)) {
    const firstChoice = body.choices[0];
    if (!firstChoice) return true;
    const message = firstChoice.message;
    const delta = firstChoice.delta;
    const content = message?.content ?? delta?.content;
    const reasoningContent = message?.reasoning_content ?? delta?.reasoning_content;
    const reasoningAlt = message?.reasoning ?? delta?.reasoning;
    const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0 || Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
    const hasContent = content !== null && content !== void 0 && content !== "";
    const hasReasoning = reasoningContent !== null && reasoningContent !== void 0 && reasoningContent !== "" || reasoningAlt !== null && reasoningAlt !== void 0 && reasoningAlt !== "";
    const finishReason = typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : "";
    if (LEGIT_EMPTY_OPENAI_FINISH.has(finishReason)) return false;
    return !hasContent && !hasReasoning && !hasToolCalls;
  }
  if (Array.isArray(body.content)) {
    if (body.content.length > 0) return false;
    const stopReason = typeof body.stop_reason === "string" ? body.stop_reason : "";
    return !LEGIT_EMPTY_CLAUDE_STOP.has(stopReason);
  }
  if (typeof body.text === "string") {
    return body.text.trim() === "";
  }
  if ("content" in body) {
    const content = body.content;
    return content === null || content === void 0 || content === "";
  }
  return false;
}
const PROVIDER_ERROR_TYPES = {
  RATE_LIMITED: "rate_limited",
  UNAUTHORIZED: "unauthorized",
  ACCOUNT_DEACTIVATED: "account_deactivated",
  FORBIDDEN: "forbidden",
  SERVER_ERROR: "server_error",
  QUOTA_EXHAUSTED: "quota_exhausted",
  PROJECT_ROUTE_ERROR: "project_route_error",
  CONTEXT_OVERFLOW: "context_overflow",
  OAUTH_INVALID_TOKEN: "oauth_invalid_token",
  EMPTY_CONTENT: "empty_content",
  MODEL_NOT_FOUND: "model_not_found",
  FINGERPRINT_REJECTION: "fingerprint_rejection",
  GEO_BLOCKED: "geo_blocked",
  // Antigravity BYOP fast-fail (executor 422, code gcp_project_required): the
  // Google account must Bring Its Own GCP Project. Account-specific and
  // fixable by entering a Project ID — never a model lockout and never a ban.
  GCP_PROJECT_REQUIRED: "gcp_project_required"
};
const CONTEXT_OVERFLOW_SIGNALS = [
  "context overflow",
  "prompt too large",
  "context window",
  "maximum context",
  "exceeds context",
  "input too long",
  "token limit",
  "too many tokens",
  "context length",
  "exceed.*context",
  "messages exceed"
];
const CONTEXT_OVERFLOW_REGEX = new RegExp(CONTEXT_OVERFLOW_SIGNALS.join("|"), "i");
function isContextOverflow(errorText) {
  return CONTEXT_OVERFLOW_REGEX.test(String(errorText || ""));
}
const MODEL_NAMED_UNSUPPORTED_REGEX = /\bmodel\b[^\n]{0,80}\bis not supported\b/i;
function containsModelUnavailableMessage(errorMessage) {
  return MODEL_NAMED_UNSUPPORTED_REGEX.test(String(errorMessage || "").toLowerCase());
}
const GEO_BLOCK_SIGNALS = [
  "user location is not supported",
  "location is not supported",
  "not supported for the api use",
  "region is not supported",
  "unsupported location",
  "not available in your location",
  "not available in your region"
];
function isGeoBlockedError(errorMessage) {
  const lower = String(errorMessage || "").toLowerCase();
  return GEO_BLOCK_SIGNALS.some((signal) => lower.includes(signal));
}
function isGeoBlockEligibleProvider(provider) {
  const p = (provider || "").toLowerCase();
  if (p === "antigravity" || p === "agy" || p === "gemini" || p === "gemini-cli" || p === "vertex") {
    return true;
  }
  if (p.includes("cloudcode") || p.includes("cloud-code")) return true;
  if (!provider) return false;
  const entry = getRegistryEntry(provider);
  if (!entry) return false;
  const surface = `${entry.executor || ""} ${entry.format || ""}`.toLowerCase();
  return surface.includes("antigravity") || surface.includes("gemini");
}
const CLOUDFLARE_1010_REGEX = /(?<![A-Za-z0-9_-])error[\s_-]?code[\\"':=\s]{0,12}1010(?!\w)|(?<![A-Za-z0-9_-])error[-_]\s?1010(?!\w)\/?/i;
function isCloudflareFingerprintRejection(errorText) {
  const text = String(errorText || "").toLowerCase();
  return CLOUDFLARE_1010_REGEX.test(text) || text.includes("browser_signature_banned") || text.includes("fingerprint_rejection");
}
function responseBodyToString(responseBody) {
  if (typeof responseBody === "string") return responseBody;
  if (responseBody !== null && typeof responseBody === "object") {
    try {
      return JSON.stringify(responseBody);
    } catch {
      return "";
    }
  }
  return "";
}
const RESOURCE_NOT_FOUND_PATTERNS = [
  /\bfiles?\b[^\n]{0,160}\b(?:not found|does not exist)\b/i,
  /\b(?:not found|does not exist)\b[^\n]{0,160}\bfiles?\b/i,
  /\b(?:input[_ -]?file|file[_ -]?id|item|response|vector[_ -]?store|upload)\b[^\n]{0,160}\b(?:not found|does not exist)\b/i,
  /\b(?:not found|does not exist)\b[^\n]{0,160}\b(?:input[_ -]?file|file[_ -]?id|item|response|vector[_ -]?store|upload)\b/i,
  /\bfile-[a-z0-9_-]+\b[^\n]{0,160}\b(?:not found|does not exist)\b/i
];
function isResourceNotFoundResponse(responseBody) {
  const body = responseBodyToString(responseBody);
  return RESOURCE_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(body));
}
function shouldPreserveQuotaSignalsFor429(provider) {
  if (!provider) return true;
  return getProviderCategory(provider) === "oauth";
}
function classifyProviderError(statusCode, responseBody, provider) {
  const bodyStr = responseBodyToString(responseBody);
  const creditsExhausted = isCreditsExhausted(bodyStr);
  const subscriptionQuotaExhausted = isSubscriptionQuotaText(bodyStr.toLowerCase());
  const accountDeactivated = isAccountDeactivated(bodyStr);
  const oauthInvalid = isOAuthInvalidToken(bodyStr);
  const preserveQuota429 = shouldPreserveQuotaSignalsFor429(provider);
  if ((creditsExhausted || subscriptionQuotaExhausted) && [400, 402, 403].includes(statusCode)) {
    return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
  }
  if ((creditsExhausted || subscriptionQuotaExhausted) && statusCode === 429 && preserveQuota429) {
    return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
  }
  if (statusCode === 429) {
    if (preserveQuota429 && isDailyQuotaExhausted(bodyStr)) {
      return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
    }
    return PROVIDER_ERROR_TYPES.RATE_LIMITED;
  }
  if (statusCode === 404) {
    if (isResourceNotFoundResponse(responseBody)) return null;
    return PROVIDER_ERROR_TYPES.MODEL_NOT_FOUND;
  }
  if (statusCode === 401) {
    if (oauthInvalid) {
      return PROVIDER_ERROR_TYPES.OAUTH_INVALID_TOKEN;
    }
    if (containsModelUnavailableMessage(bodyStr)) {
      return PROVIDER_ERROR_TYPES.MODEL_NOT_FOUND;
    }
    return accountDeactivated ? PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED : PROVIDER_ERROR_TYPES.UNAUTHORIZED;
  }
  if (statusCode === 402) return PROVIDER_ERROR_TYPES.QUOTA_EXHAUSTED;
  if ((statusCode === 400 || statusCode === 403) && isGeoBlockEligibleProvider(provider) && isGeoBlockedError(bodyStr)) {
    return PROVIDER_ERROR_TYPES.GEO_BLOCKED;
  }
  if (statusCode === 403 && isCloudflareFingerprintRejection(bodyStr)) {
    return PROVIDER_ERROR_TYPES.FINGERPRINT_REJECTION;
  }
  if (statusCode === 403 && accountDeactivated) {
    return PROVIDER_ERROR_TYPES.ACCOUNT_DEACTIVATED;
  }
  if (statusCode === 403) {
    const p = (provider || "").toLowerCase();
    const isCloudCodeProvider = p === "antigravity" || p === "gemini-cli" || p.includes("cloudcode") || p.includes("cloud-code");
    const recoverableProject403 = bodyStr.includes("has not been used in project") || bodyStr.includes("SERVICE_DISABLED") || bodyStr.includes("accessNotConfigured") || bodyStr.includes("PERMISSION_DENIED") || /\bit is disabled\b/i.test(bodyStr) || isCloudCodeProvider;
    if (recoverableProject403) {
      return PROVIDER_ERROR_TYPES.PROJECT_ROUTE_ERROR;
    }
    if (bodyStr.includes("SENTINEL_BLOCKED") || /\bSentinel\b[^\n]{0,80}\bblocked\b/i.test(bodyStr) || /\bTurnstile required\b/i.test(bodyStr)) {
      return PROVIDER_ERROR_TYPES.FORBIDDEN;
    }
    if (provider && getProviderCategory(provider) === "apikey") {
      return null;
    }
    if (provider && getRegistryEntry(provider)?.authType === "none") {
      return null;
    }
    return PROVIDER_ERROR_TYPES.FORBIDDEN;
  }
  if (statusCode >= 500) return PROVIDER_ERROR_TYPES.SERVER_ERROR;
  if (statusCode === 422 && bodyStr.includes("gcp_project_required")) {
    return PROVIDER_ERROR_TYPES.GCP_PROJECT_REQUIRED;
  }
  if (statusCode === 400) {
    if (isContextOverflow(bodyStr)) {
      return PROVIDER_ERROR_TYPES.CONTEXT_OVERFLOW;
    }
    if (containsModelUnavailableMessage(bodyStr)) {
      return PROVIDER_ERROR_TYPES.MODEL_NOT_FOUND;
    }
  }
  return null;
}
export {
  CONTEXT_OVERFLOW_REGEX,
  CONTEXT_OVERFLOW_SIGNALS,
  PROVIDER_ERROR_TYPES,
  classifyProviderError,
  containsModelUnavailableMessage,
  isCloudflareFingerprintRejection,
  isContextOverflow,
  isEmptyContentResponse,
  isGeoBlockedError,
  isResourceNotFoundResponse
};
