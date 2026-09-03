// ADAPTED STUB — OmniRoute `src/app/api/v1/_shared/rateLimit.ts` tracks
// per-credential rate limits; `isAllRateLimitedCredentials` short-circuits
// combo dispatch when every candidate credential is rate-limited. This
// OryphemRouter adaptation reports false (never all rate-limited).
export function isAllRateLimitedCredentials(_provider, _opts) {
  return false;
}
