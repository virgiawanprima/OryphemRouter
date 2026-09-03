// ADAPTED — graceful fallback (was open-sse/services/tokenLimitCounter.ts).
// Per-api-key token-limit counter depends on DB infra not ported; no-op.
export function recordTokenUsage() {
  return undefined;
}
export function checkTokenLimits() {
  return null;
}
export function getCurrentWindowUsage() {
  return 0;
}
export function seedWindowUsageFromHistory() {
  return 0;
}