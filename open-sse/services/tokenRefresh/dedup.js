// In-flight dedup entries must outlive the underlying refresh HTTP timeout
// (AbortSignal.timeout(30000) in providers.js) — otherwise a slow refresh is
// re-fanned-out and TWO concurrent refreshes rotate the SAME refresh token
// (second one → refresh_token_reused → account lockout).
const IN_FLIGHT_TTL_MS = 35_000;
// Successful results may be reused briefly to avoid stampedes; keep this
// shorter than the in-flight window since the token is already materialized.
const REFRESH_RESULT_TTL_MS = 10_000;
const refreshDedupCache = new Map();

export async function dedupRefresh(provider, oldToken, fn, log) {
  if (!oldToken) return fn();
  const key = `${provider}:${oldToken}`;
  const hit = refreshDedupCache.get(key);
  if (hit) {
    if (hit.promise) {
      if (hit.expiresAt > Date.now()) {
        log?.info?.("TOKEN_REFRESH", `Reusing in-flight refresh for ${provider}`);
        return hit.promise;
      }
      // Stale promise (e.g. hung request) — fall through to retry
      refreshDedupCache.delete(key);
    } else if (hit.expiresAt > Date.now()) {
      log?.info?.("TOKEN_REFRESH", `Reusing recent refresh result for ${provider}`);
      return hit.result;
    } else {
      refreshDedupCache.delete(key);
    }
  }
  const promise = (async () => {
    try {
      const result = await fn();
      // Only cache SUCCESSFUL (non-null) results. A null result means the
      // refresh failed (network/5xx) — caching it would make the failure sticky
      // for the whole TTL and starve retries of a real refresh attempt.
      if (result != null) {
        refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });
      } else {
        refreshDedupCache.delete(key);
      }
      return result;
    } catch (err) {
      refreshDedupCache.delete(key);
      throw err;
    }
  })();
  refreshDedupCache.set(key, { promise, expiresAt: Date.now() + IN_FLIGHT_TTL_MS });
  return promise;
}
