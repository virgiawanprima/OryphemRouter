/**
 * rateLimitAdapter.js — clean facade over the ported OmniRoute rate-limit services.
 *
 * Wraps the standalone, not-yet-consumed rate-limit modules in this directory
 * (rateLimitManager.js, providerDefaultRateLimit.js, rateLimitSemaphore.js,
 * geminiRateLimitTracker.js, wafRateLimit.js) behind a small, stable public API:
 *
 *   withRateLimit(provider, model, fn, opts?)  -> Promise<fn's result>
 *   getRateLimitConfig(provider)               -> Promise<config | null>
 *   checkRateLimit(provider, model)            -> Promise<{ allowed, retryAfterMs }>
 *
 * Guarantees:
 *   - Every interaction with the ported modules goes through a cached dynamic
 *     import wrapped in try/catch, so a missing or broken dependency can never
 *     break a caller: execution degrades to running `fn` directly, with a
 *     one-time warning logged per degradation path.
 *   - `withRateLimit` never double-executes `fn`: degradation only runs `fn`
 *     directly when we can prove it has not started yet.
 *   - Genuine rate-limit outcomes (local queue-full / execution-timeout /
 *     wedge errors, abort signals) are NOT swallowed — callers need to see them.
 */

import { log } from "../utils/log.js";

// Cached dynamic-import promises, one entry per specifier. A failed import is
// cached as `null` so we only attempt (and only warn about) it once.
const moduleCache = new Map();
// Messages already warned, so degradation logs exactly once per path.
const warned = new Set();

function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  log.warn("RATE-LIMIT", `[rateLimitAdapter] ${message}`);
}

/**
 * Load a ported service module defensively. Resolves to the module namespace,
 * or `null` when the module is missing / fails to parse / has a broken import.
 * Never rejects.
 */
function loadModule(specifier) {
  if (!moduleCache.has(specifier)) {
    moduleCache.set(
      specifier,
      import(specifier).catch((err) => {
        warnOnce(
          `ported module ${specifier} unavailable (${err?.message ?? err}); rate limiting disabled`
        );
        return null;
      })
    );
  }
  return moduleCache.get(specifier);
}

// Error codes the ported limiter brands onto local rate-limit failures
// (see rateLimitManager/errors.js). These are meaningful outcomes, not
// infrastructure breakage, and must propagate to callers.
const LOCAL_RATE_LIMIT_CODES = new Set([
  "RATE_LIMIT_QUEUE_FULL",
  "RATE_LIMIT_EXECUTION_TIMEOUT",
  "RATE_LIMIT_QUEUE_WEDGED",
  "RATE_LIMIT_QUEUE_TIMEOUT"
]);

function isLocalRateLimitOutcome(err) {
  if (!err || (typeof err !== "object" && typeof err !== "function")) return false;
  if (err.name === "AbortError") return true;
  if (typeof err.code === "string" && LOCAL_RATE_LIMIT_CODES.has(err.code)) return true;
  // Bottleneck-branded errors (execution expiration, watchdog wedge reset).
  if (typeof err.name === "string" && err.name.toLowerCase().includes("bottleneck")) return true;
  return false;
}

// The ported rateLimitManager keys limiters by (provider, connectionId). The
// adapter surface only exposes (provider, model), so a connectionId is derived
// from opts when provided, falling back to the provider name.
function resolveConnectionId(provider, opts) {
  if (opts && typeof opts === "object") {
    return opts.connectionId ?? opts.connection ?? opts.accountId ?? provider;
  }
  return provider;
}

/**
 * Wrap `fn` with the ported OmniRoute rate limiter for the given provider/model.
 *
 * opts (optional):
 *   connectionId/connection/accountId — scopes the limiter; defaults to `provider`
 *   signal                        — AbortSignal forwarded to the ported limiter
 *
 * Degradation: if the ported module cannot be loaded, or the limiter fails
 * before dispatching `fn`, `fn` is run directly (unthrottled) and a one-time
 * warning is logged. Errors thrown BY `fn` and genuine local rate-limit
 * outcomes are always propagated; `fn` is never executed twice.
 */
export async function withRateLimit(provider, model, fn, opts = {}) {
  if (typeof fn !== "function") {
    throw new TypeError("rateLimitAdapter.withRateLimit: `fn` must be a function");
  }
  const mod = await loadModule("./rateLimitManager.js");
  if (!mod || typeof mod.withRateLimit !== "function") {
    warnOnce("ported rateLimitManager.withRateLimit unavailable; running unthrottled");
    return fn();
  }

  const signal = opts && typeof opts === "object" ? opts.signal ?? null : null;
  const connectionId = resolveConnectionId(provider, opts);

  // Track whether the wrapped fn has started so degradation never re-runs it.
  let fnStarted = false;
  const wrappedFn = async (...args) => {
    fnStarted = true;
    return fn(...args);
  };

  try {
    return await mod.withRateLimit(provider, connectionId, model, wrappedFn, signal);
  } catch (err) {
    // Genuine rate-limit outcomes (queue full / execution timeout / wedge) and
    // abort signals must reach callers so they can react (surface 429, retry
    // elsewhere, ...). Never swallow these.
    if (isLocalRateLimitOutcome(err)) throw err;
    // If `fn` already started, re-throwing is the only safe move: running it
    // again would double-execute the work.
    if (fnStarted) throw err;
    // The ported limiter broke BEFORE dispatching `fn` — degrade to running
    // the work directly so the caller is never blocked by broken infra.
    warnOnce(`ported limiter failed before dispatch (${err?.message ?? err}); running unthrottled`);
    return fn();
  }
}

/**
 * Return the ported default rate-limit config for a provider, or `null` when
 * the provider has no configured default (or the ported module is unavailable).
 *
 * Example: getRateLimitConfig("nvidia") -> { requests: 40, windowMs: 60000 }
 */
export async function getRateLimitConfig(provider) {
  try {
    const mod = await loadModule("./providerDefaultRateLimit.js");
    if (mod && typeof mod.getProviderDefaultRateLimit === "function") {
      return mod.getProviderDefaultRateLimit(provider) ?? null;
    }
  } catch (err) {
    warnOnce(`getRateLimitConfig failed (${err?.message ?? err}); returning null`);
  }
  return null;
}

// Advisory queue-depth threshold used by checkRateLimit when a provider has a
// hard default cap and the ported limiter is reporting a saturated queue.
const ADVISORY_QUEUE_DEPTH = 100;

/**
 * Non-destructive check of whether a request for (provider, model) is currently
 * allowed. Combines the live, read-only signals exposed by the ported modules:
 *   - geminiRateLimitTracker per-minute/day counters (gemini/google providers),
 *   - rateLimitSemaphore gate state (rate-limited-until / concurrency saturation),
 *   - providerDefaultRateLimit hard-cap presence + rateLimitManager queue depth.
 *
 * Never consumes a rate-limit slot and never rejects: on any ported-module
 * failure it falls back to `{ allowed: true, retryAfterMs: 0 }`.
 *
 * @returns {Promise<{ allowed: boolean, retryAfterMs: number }>}
 */
export async function checkRateLimit(provider, model) {
  try {
    const [semMod, geminiMod, rlMod, pdrlMod] = await Promise.all([
      loadModule("./rateLimitSemaphore.js"),
      loadModule("./geminiRateLimitTracker.js"),
      loadModule("./rateLimitManager.js"),
      loadModule("./providerDefaultRateLimit.js")
    ]);

    // 1) Gemini tracker — live per-minute / per-day / per-token counters.
    if (geminiMod && (provider === "gemini" || provider === "google")) {
      const modelId = model ? String(model).replace(/^gemini\//, "") : "";
      const minuteExhausted =
        typeof geminiMod.isMinuteRateExhausted === "function" &&
        geminiMod.isMinuteRateExhausted(modelId);
      const dailyExhausted =
        typeof geminiMod.isRpdExhausted === "function" && geminiMod.isRpdExhausted(modelId);
      if (minuteExhausted || dailyExhausted) {
        return { allowed: false, retryAfterMs: 60_000 };
      }
    }

    // 2) Semaphore gate — read-only live state (no slot consumed).
    if (semMod && typeof semMod.getStats === "function") {
      const stats = semMod.getStats();
      const modelKey = model ? `${provider}/${model}` : provider;
      const gate = stats[modelKey] ?? stats[model] ?? null;
      if (gate) {
        if (gate.rateLimitedUntil) {
          const retryAfterMs = Math.max(0, new Date(gate.rateLimitedUntil).getTime() - Date.now());
          if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
        }
        if (typeof gate.max === "number" && gate.max > 0 && gate.running >= gate.max) {
          return { allowed: false, retryAfterMs: 0 };
        }
      }
    }

    // 3) Provider-default hard cap: if one exists and the ported limiter's
    //    queue is saturated, reject fast (advisory; never consumes a slot).
    if (pdrlMod && typeof pdrlMod.getProviderDefaultRateLimit === "function") {
      const cfg = pdrlMod.getProviderDefaultRateLimit(provider);
      if (cfg && rlMod && typeof rlMod.getRateLimitStatus === "function") {
        const status = rlMod.getRateLimitStatus(provider, provider);
        const queueDepth = status?.queued ?? 0;
        if (queueDepth >= ADVISORY_QUEUE_DEPTH) {
          return { allowed: false, retryAfterMs: 1_000 };
        }
      }
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch {
    // Any ported-module surprise → allow; the caller should not be blocked.
    return { allowed: true, retryAfterMs: 0 };
  }
}
