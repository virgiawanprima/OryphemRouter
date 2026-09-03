// ADAPTED STUB (was @/app/api/v1/_shared/rateLimit). No-op rate limiter.
export async function rateLimit() { return { ok: true, remaining: Infinity, limit: Infinity, reset: 0 }; }
export function rateLimitKey() { return "noop"; }
export default { rateLimit, rateLimitKey };
