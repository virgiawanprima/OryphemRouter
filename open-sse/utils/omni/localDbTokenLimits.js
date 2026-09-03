// ADAPTED STUB — OmniRoute `src/lib/db/tokenLimits.ts` is DB-backed
// (api_key_token_limits / api_key_token_counters). OryphemRouter has no token
// limit DB; this in-memory implementation keeps services/tokenLimitCounter.js
// functional: no configured limits (getTokenLimitsForRequest → []) means no
// breaches, while the window helpers behave like a fresh cold window.
const counters = new Map(); // `${limitId}:${windowStart}` -> tokens used
const resetLogs = [];

function windowMillis(resetInterval) {
  if (resetInterval === "monthly") return 30 * 86_400_000;
  if (resetInterval === "hourly") return 3_600_000;
  if (resetInterval === "weekly") return 7 * 86_400_000;
  return 86_400_000; // daily / session
}

export function resetWindowIfElapsed(limit, now = Date.now()) {
  const ms = windowMillis(limit?.resetInterval);
  const periodStartAt = now - ms;
  return {
    windowStart: String(periodStartAt),
    didReset: false,
    periodStartAt,
    nextResetAt: now + ms,
  };
}

export function getWindowUsage(limit, now = Date.now()) {
  const { windowStart } = resetWindowIfElapsed(limit, now);
  return counters.get(`${limit?.id}:${windowStart}`) || 0;
}

export function incrementWindowTokens(limitId, windowStart, tokens) {
  const key = `${limitId}:${windowStart}`;
  const delta = Math.max(0, Math.floor(Number(tokens) || 0));
  const next = (counters.get(key) || 0) + delta;
  counters.set(key, next);
  return next;
}

export function logTokenLimitReset(limitId, prevTokens, windowStart) {
  resetLogs.push({ limitId, windowStart, prevTokens, at: Date.now() });
}

export function getTokenLimitsForRequest(_apiKeyId, _provider, _model) {
  return [];
}

export function clearTokenLimitCache() {
  counters.clear();
  resetLogs.length = 0;
}
