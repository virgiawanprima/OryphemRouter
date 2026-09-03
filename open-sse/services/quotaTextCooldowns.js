import { RateLimitReason } from "../utils/omni/rateLimitConstants.js";
import { parseDayGranularityResetMs } from "./quotaResetParsing.js";
function isSubscriptionQuotaText(lower, provider) {
  return lower.includes("usage limit reached") || lower.includes("usage limit has been") || lower.includes("claude pro usage limit") || lower.includes("you've reached your usage limit") || lower.includes("you have reached your usage limit") || // Native Claude OAuth uses this otherwise-generic 429 wording for an
  // exhausted subscription window. Keep it provider-scoped: other upstreams
  // can use the same phrase for a short RPM throttle.
  provider === "claude" && lower.includes("this request would exceed your account's rate limit");
}
const SUBSCRIPTION_QUOTA_COOLDOWN_MS = 60 * 60 * 1e3;
function buildSubscriptionQuotaFallback(errorStr, getUpstreamRetryHintMs, parseRetryFromErrorText, provider) {
  if (!isSubscriptionQuotaText(errorStr.toLowerCase(), provider)) return null;
  const hintMs = getUpstreamRetryHintMs();
  const bodyHint = parseRetryFromErrorText(errorStr);
  return {
    shouldFallback: true,
    cooldownMs: hintMs ?? SUBSCRIPTION_QUOTA_COOLDOWN_MS,
    reason: RateLimitReason.QUOTA_EXHAUSTED,
    usedUpstreamRetryHint: Boolean(hintMs),
    quotaResetHintMs: bodyHint ?? void 0
  };
}
const WEEKLY_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1e3;
function isWeeklyUsageLimitText(lower) {
  return lower.includes("weekly usage limit") || lower.includes("weekly limit reached") || lower.includes("reached your weekly") || lower.includes("1-week quota") || lower.includes("week quota") || lower.includes("weekly/monthly limit") || lower.includes("weekly") && lower.includes("quota") && lower.includes("exhaust");
}
const MAX_WEEKLY_QUOTA_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1e3;
function buildWeeklyQuotaFallback(errorStr) {
  if (!isWeeklyUsageLimitText(errorStr.toLowerCase())) return null;
  const parsedResetMs = parseDayGranularityResetMs(errorStr, MAX_WEEKLY_QUOTA_COOLDOWN_MS);
  const cooldownMs = typeof parsedResetMs === "number" && parsedResetMs > 0 ? parsedResetMs : WEEKLY_QUOTA_COOLDOWN_MS;
  return {
    shouldFallback: true,
    cooldownMs,
    reason: RateLimitReason.QUOTA_EXHAUSTED,
    usedUpstreamRetryHint: typeof parsedResetMs === "number" && parsedResetMs > 0,
    quotaResetHintMs: typeof parsedResetMs === "number" && parsedResetMs > 0 ? parsedResetMs : void 0
  };
}
const SESSION_QUOTA_COOLDOWN_MS = 5 * 60 * 60 * 1e3;
function isSessionUsageLimitText(lower) {
  return lower.includes("session usage limit") || lower.includes("session limit reached") || lower.includes("reached your session") && lower.includes("usage limit");
}
function buildSessionQuotaFallback(errorStr) {
  if (!isSessionUsageLimitText(errorStr.toLowerCase())) return null;
  return {
    shouldFallback: true,
    cooldownMs: SESSION_QUOTA_COOLDOWN_MS,
    reason: RateLimitReason.QUOTA_EXHAUSTED
  };
}
export {
  buildSessionQuotaFallback,
  buildSubscriptionQuotaFallback,
  buildWeeklyQuotaFallback,
  isSessionUsageLimitText,
  isSubscriptionQuotaText,
  isWeeklyUsageLimitText
};
