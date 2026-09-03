const QUOTA_EXHAUSTED_KEYWORDS = [
  "quota_exhausted",
  "quota exhausted",
  // Antigravity native message: "Individual quota reached. Contact your administrator to enable overages."
  "quota reached",
  "enable overages",
  "individual quota"
];
const CREDITS_EXHAUSTED_KEYWORDS = [
  "google_one_ai",
  "insufficient credit",
  "insufficient credits",
  "not enough credit",
  "not enough credits",
  "credit exhausted",
  "credits exhausted",
  "credit balance",
  "minimumcreditamountforusage",
  "minimum credit amount for usage",
  "minimum credit",
  "insufficient_g1_credits_balance",
  "g1_credits"
];
const SHORT_COOLDOWN_MS = 5 * 60 * 1e3;
const INSTANT_RETRY_THRESHOLD_MS = 3 * 1e3;
const FULL_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1e3;
function classify429(errorMessage) {
  const lower = (errorMessage || "").toLowerCase();
  if (/\breset\s+(?:after|in)\s+0s\b/.test(lower)) {
    return "rate_limited";
  }
  for (const kw of QUOTA_EXHAUSTED_KEYWORDS) {
    if (lower.includes(kw)) return "quota_exhausted";
  }
  for (const kw of CREDITS_EXHAUSTED_KEYWORDS) {
    if (lower.includes(kw)) return "quota_exhausted";
  }
  if (lower.includes("per minute") || lower.includes("rpm") || lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("too many requests")) {
    return "rate_limited";
  }
  if (lower.includes("free tier") || lower.includes("daily limit") || lower.includes("exhausted your capacity")) {
    return "quota_exhausted";
  }
  if (lower.includes("try again") || lower.includes("temporarily")) {
    return "soft_rate_limit";
  }
  return "unknown";
}
function decide429(category, retryAfterMs) {
  switch (category) {
    case "soft_rate_limit":
      return {
        kind: retryAfterMs && retryAfterMs <= INSTANT_RETRY_THRESHOLD_MS ? "instant_retry_same_auth" : "soft_retry",
        retryAfterMs: retryAfterMs ?? 2e3,
        reason: "Soft rate limit \u2014 brief backoff"
      };
    case "rate_limited":
      return {
        kind: retryAfterMs && retryAfterMs <= SHORT_COOLDOWN_MS ? "soft_retry" : "short_cooldown_switch_auth",
        retryAfterMs: retryAfterMs ?? 6e4,
        reason: "RPM rate limit \u2014 switch auth if cooldown is long"
      };
    case "quota_exhausted":
      return {
        kind: "full_quota_exhausted",
        retryAfterMs: retryAfterMs ?? FULL_QUOTA_COOLDOWN_MS,
        reason: "Quota exhausted \u2014 skip this account"
      };
    default:
      return {
        kind: "soft_retry",
        retryAfterMs: retryAfterMs ?? 5e3,
        reason: "Unknown 429 \u2014 generic backoff"
      };
  }
}
const creditsFailureMap = /* @__PURE__ */ new Map();
const CREDITS_DISABLE_THRESHOLD = 3;
const CREDITS_COOLDOWN_MS = 5 * 60 * 60 * 1e3;
function recordCreditsFailure(authKey) {
  const state = creditsFailureMap.get(authKey) ?? { count: 0, disabledUntil: 0 };
  state.count++;
  if (state.count >= CREDITS_DISABLE_THRESHOLD) {
    state.disabledUntil = Date.now() + CREDITS_COOLDOWN_MS;
    creditsFailureMap.set(authKey, state);
    return true;
  }
  creditsFailureMap.set(authKey, state);
  return false;
}
function isCreditsDisabled(authKey) {
  const state = creditsFailureMap.get(authKey);
  if (!state) return false;
  if (state.disabledUntil > Date.now()) return true;
  creditsFailureMap.delete(authKey);
  return false;
}
export {
  FULL_QUOTA_COOLDOWN_MS,
  SHORT_COOLDOWN_MS,
  classify429,
  decide429,
  isCreditsDisabled,
  recordCreditsFailure
};
