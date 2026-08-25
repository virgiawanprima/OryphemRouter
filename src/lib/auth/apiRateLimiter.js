/**
 * OryphemRouter — Simple in-memory per-IP rate limiter for LLM API endpoints.
 * ===========================================================================
 *
 * Sliding-window limiter keyed by client IP. No external dependencies, no
 * cross-process guarantees — it protects against casual abuse / runaway loops
 * on a single instance, not coordinated multi-node attacks.
 *
 * USAGE:
 *   import { checkRateLimit } from "@/lib/auth/apiRateLimiter";
 *   const { allowed, retryAfterMs } = checkRateLimit(request, { windowMs: 60_000, max: 120 });
 *   if (!allowed) return new Response(..., { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } });
 *
 * IP SOURCE (in priority order):
 *   1. `x-9r-real-ip` — only trusted when custom-server.js stamped it from the
 *      unspoofable TCP socket (see trustedPeer.js). Never attacker-controllable.
 *   2. `x-forwarded-for` first value — only when TRUST_PROXY=true (operator opt-in).
 *   3. Fallback "unknown" — a single shared bucket so spoofed headers cannot
 *      rotate a client out of its own bucket when running without custom-server.
 */

// ============================================================
// CONSTANTS
// ============================================================

/** How often the cleanup sweep runs (milliseconds). */
const CLEANUP_INTERVAL_MS = 60_000;

/** Hard cap on tracked IPs before a full sweep (anti memory-growth guard). */
const MAX_TRACKED_IPS = 10_000;

/** Longest window we ever need to retain timestamps for (1 hour). */
const MAX_WINDOW_MS = 60 * 60 * 1_000;

/** Default per-IP chat limit (generous — 120 req/min so normal usage never trips). */
export const DEFAULT_CHAT_LIMIT = { windowMs: 60_000, max: 120 };

/** Default per-IP health limit (higher — health checks are cheap). */
export const DEFAULT_HEALTH_LIMIT = { windowMs: 60_000, max: 300 };

// ============================================================
// STATE
// ============================================================

/** @type {Map<string, number[]>} ip → sorted array of request timestamps (ms) */
const buckets = new Map();

let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - MAX_WINDOW_MS;
    for (const [ip, timestamps] of buckets) {
      while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
      if (timestamps.length === 0) buckets.delete(ip);
    }
  }, CLEANUP_INTERVAL_MS);
  // Do not keep the process alive just for cleanup.
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// ============================================================
// IP EXTRACTION
// ============================================================

/**
 * Resolve the client IP for rate-limit bucketing.
 * Reuses the same trust rules as loginLimiter.getClientIp so buckets cannot be
 * evaded by spoofing forwarding headers.
 * @param {Request|object} request - Fetch-style Request (may be absent in tests)
 * @returns {string}
 */
export function getClientIp(request) {
  const get = (name) => {
    if (!request) return null;
    if (typeof request.headers?.get === "function") return request.headers.get(name);
    // Plain-object headers fallback (e.g. tests or hand-built requests)
    if (request.headers && typeof request.headers === "object") {
      const lower = request.headers[name] ?? request.headers[name.toLowerCase()];
      return lower ?? null;
    }
    return null;
  };

  // Only trustworthy when custom-server.js proved it stamped the header from
  // the TCP socket; otherwise a client could rotate the value to escape buckets.
  const realIp = get("x-9r-real-ip");
  if (realIp) return realIp;

  // Behind a trusted reverse proxy that overwrites XFF with the real client IP.
  if (process.env.TRUST_PROXY === "true") {
    const xff = get("x-forwarded-for");
    if (xff) return String(xff).split(",")[0].trim();
  }

  // Direct exposure without custom-server: single bucket so spoofed XFF
  // rotation cannot escape the limiter.
  return "unknown";
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Check whether a request is within its per-IP rate limit.
 *
 * Sliding window: the request is allowed if fewer than `max` timestamps from
 * this IP fall inside the trailing `windowMs`. Allowed requests append their
 * timestamp; denied requests do not (so the window does not extend on abuse).
 *
 * @param {Request|object} request - Fetch-style Request
 * @param {object} [opts]
 * @param {number} [opts.windowMs=60000] - Window length in milliseconds
 * @param {number} [opts.max=120] - Max requests allowed per window
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 *   `retryAfterMs` is present (and > 0) only when the request is denied.
 */
export function checkRateLimit(request, { windowMs = 60_000, max = 120 } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) windowMs = 60_000;
  if (!Number.isInteger(max) || max <= 0) max = 120;

  const ip = getClientIp(request);
  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = buckets.get(ip);
  if (!timestamps) {
    timestamps = [];
    buckets.set(ip, timestamps);
  }

  // Drop entries that fell out of the window.
  while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();

  if (timestamps.length >= max) {
    // Denied: retry after the oldest in-window request expires.
    const retryAfterMs = Math.max(1, timestamps[0] + windowMs - now);
    return { allowed: false, retryAfterMs };
  }

  // Keep the array bounded to `max` entries (oldest-first insertion order).
  timestamps.push(now);
  if (timestamps.length > max) timestamps.shift();

  // Periodic cleanup (unref'd timer) + anti-growth guard for burst scenarios.
  startCleanup();
  if (buckets.size > MAX_TRACKED_IPS) {
    const sweepCutoff = now - MAX_WINDOW_MS;
    for (const [key, ts] of buckets) {
      while (ts.length && ts[0] <= sweepCutoff) ts.shift();
      if (ts.length === 0) buckets.delete(key);
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Reset all rate-limit state (mainly for tests / manual recovery).
 */
export function resetRateLimits() {
  buckets.clear();
}

/** Exposed for tests. */
export const __test__ = { buckets };
