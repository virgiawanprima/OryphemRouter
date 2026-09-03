// ADAPTED STUB — OmniRoute services/accountFallback.ts exports account-state
// classifiers (isAccountDeactivated / isCreditsExhausted / isDailyQuotaExhausted
// / isOAuthInvalidToken) that the OryphemRouter port of accountFallback.js does
// not include. Ported signal-list subsets so errorClassifier keeps its
// terminal-stop classification behavior.
const ACCOUNT_DEACTIVATED_SIGNALS = [
  "account_deactivated",
  "account has been deactivated",
  "account has been disabled",
  "your account has been suspended",
  "this account is deactivated",
  "verify your account to continue",
  "this service has been disabled in this account for violation",
  "this service has been disabled in this account",
];

const CREDITS_EXHAUSTED_SIGNALS = [
  "insufficient_quota",
  "billing_hard_limit_reached",
  "exceeded your current quota",
  "exceeded your current usage quota",
  "credit_balance_too_low",
  "your credit balance is too low",
  "credits exhausted",
  "out of credits",
  "payment required",
  "free tier of the model has been exhausted",
  "tier has been exhausted",
  "insufficient balance",
  "insufficient_balance",
  "insufficient account balance",
  "insufficient credit balance",
  "insufficient credits",
  "insufficient credit",
];

const OAUTH_INVALID_TOKEN_SIGNALS = [
  "invalid authentication credentials",
  "oauth 2",
  "login cookie",
  "valid authentication credential",
  "invalid credentials",
];

export function isAccountDeactivated(errorText) {
  const lower = String(errorText || "").toLowerCase();
  return ACCOUNT_DEACTIVATED_SIGNALS.some((sig) => lower.includes(sig));
}

export function isCreditsExhausted(errorText) {
  const lower = String(errorText || "").toLowerCase();
  return CREDITS_EXHAUSTED_SIGNALS.some((sig) => lower.includes(sig));
}

export function isOAuthInvalidToken(errorText) {
  const lower = String(errorText || "").toLowerCase();
  return OAUTH_INVALID_TOKEN_SIGNALS.some((sig) => lower.includes(sig));
}

export function isDailyQuotaExhausted(errorText) {
  if (!errorText) return false;
  const lower = String(errorText).toLowerCase();
  return (
    lower.includes("today's quota") ||
    lower.includes("daily quota") ||
    lower.includes("try again tomorrow")
  );
}
