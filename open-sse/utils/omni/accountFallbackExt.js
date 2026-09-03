// ADAPTATION for OryphemRouter.
// OmniRoute's `open-sse/services/accountFallback.ts` is huge (~2200 lines) and the
// existing OryphemRouter `open-sse/services/accountFallback.js` only contains a subset of
// exports. This module re-exports everything from the existing ported file and adds the
// handful of functions the ported generic services (rateLimitManager, accountSelector,
// webSessionPoolHealth) actually import, implemented as faithful minimal versions of the
// OmniRoute originals.

export * from "../../services/accountFallback.js";

const RateLimitReason = {
  QUOTA_EXHAUSTED: "quota_exhausted",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  MODEL_CAPACITY: "model_capacity",
  SERVER_ERROR: "server_error",
  AUTH_ERROR: "auth_error",
  UNKNOWN: "unknown",
};

function toJsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Parse delay strings like "33s", "26.660853464s", "2m", "1h", "1500ms", or a bare number of seconds. */
export function parseDelayString(value) {
  if (!value) return null;
  const str = String(value).trim();
  const msMatch = /^(\d+(?:\.\d+)?)\s*ms$/i.exec(str);
  if (msMatch) return Math.round(Number.parseFloat(msMatch[1]));
  const secMatch = /^(\d+(?:\.\d+)?)\s*s$/i.exec(str);
  if (secMatch) return Math.round(Number.parseFloat(secMatch[1]) * 1000);
  const minMatch = /^(\d+(?:\.\d+)?)\s*m$/i.exec(str);
  if (minMatch) return Math.round(Number.parseFloat(minMatch[1]) * 60 * 1000);
  const hrMatch = /^(\d+(?:\.\d+)?)\s*h$/i.exec(str);
  if (hrMatch) return Math.round(Number.parseFloat(hrMatch[1]) * 3600 * 1000);
  const num = Number.parseFloat(str);
  return Number.isFinite(num) ? Math.round(num * 1000) : null;
}

/**
 * Parse Retry-After hints from a 429 JSON response body (OmniRoute accountFallback.ts
 * `parseRetryAfterFromBody`). Handles Gemini `error.details[].retryDelay` grammar.
 */
export function parseRetryAfterFromBody(responseBody) {
  let body;
  try {
    body = toJsonRecord(
      typeof responseBody === "string" ? JSON.parse(responseBody) : responseBody
    );
  } catch {
    return { retryAfterMs: null, reason: RateLimitReason.UNKNOWN };
  }

  if (Object.keys(body).length === 0) {
    return { retryAfterMs: null, reason: RateLimitReason.UNKNOWN };
  }

  const error = toJsonRecord(body.error);
  const details = error.details || body.details || [];
  for (const detail of Array.isArray(details) ? details : []) {
    const detailRecord = toJsonRecord(detail);
    if (detailRecord.retryDelay) {
      return {
        retryAfterMs: parseDelayString(detailRecord.retryDelay),
        reason: RateLimitReason.RATE_LIMIT_EXCEEDED,
      };
    }
  }

  // Top-level / nested error fields: ISO timestamp or millisecond value
  const retryAfter = error.retryAfter ?? body.retryAfter;
  if (typeof retryAfter === "string") {
    const parsedTs = Date.parse(retryAfter);
    if (Number.isFinite(parsedTs)) {
      return { retryAfterMs: parsedTs - Date.now(), reason: RateLimitReason.RATE_LIMIT_EXCEEDED };
    }
    return { retryAfterMs: parseDelayString(retryAfter), reason: RateLimitReason.RATE_LIMIT_EXCEEDED };
  }
  if (typeof retryAfter === "number") {
    return { retryAfterMs: retryAfter, reason: RateLimitReason.RATE_LIMIT_EXCEEDED };
  }

  return { retryAfterMs: null, reason: RateLimitReason.UNKNOWN };
}

/**
 * 0–100 health score for an account (OmniRoute accountFallback.ts `getAccountHealth`).
 * Mirrors the original scoring: backoff escalates, errors and active rate-limits subtract.
 */
export function getAccountHealth(account, model) {
  if (!account) return 0;
  let score = 100;
  score -= (account.backoffLevel || 0) * 10;
  if (account.lastError) score -= 20;
  if (account.rateLimitedUntil && isAccountUnavailable(account.rateLimitedUntil)) score -= 30;
  return Math.max(0, score);
}

/** Provider-level cooldown state (see OmniRoute accountFallback.ts getProviderCooldownRemainingMs). */
export function getProviderCooldownRemainingMs(provider) {
  const until = globalThis.__OMNIROUTE_PROVIDER_COOLDOWN_UNTIL__?.[provider];
  if (!until) return null;
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : null;
}

/** Whether a provider is currently in cooldown (see OmniRoute accountFallback.ts isProviderInCooldown). */
export function isProviderInCooldown(provider) {
  return getProviderCooldownRemainingMs(provider) !== null;
}
