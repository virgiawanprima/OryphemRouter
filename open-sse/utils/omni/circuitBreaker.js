// ADAPTATION for OryphemRouter.
// OmniRoute's `src/shared/utils/circuitBreaker.ts` (~21KB) implements a provider circuit
// breaker (open/closed/half-open with failure counting + retryAfter). Deep app infra —
// this minimal version keeps the global breaker state map and exposes the status snapshot
// consumed by `webSessionPoolHealth`, plus a small `recordFailure/recordSuccess` API so the
// state is meaningful. NOTE: thresholds are fixed defaults, not configurable here.

const _state = new Map(); // provider -> { failures, successStreak, openedAt, state }

function entry(provider) {
  if (!_state.has(provider)) {
    _state.set(provider, { failures: 0, successStreak: 0, openedAt: null, state: "closed" });
  }
  return _state.get(provider);
}

export function recordProviderFailure(provider, opts = {}) {
  const e = entry(provider);
  e.failures += 1;
  e.successStreak = 0;
  const threshold = opts?.failureThreshold ?? 5;
  if (e.failures >= threshold) {
    e.state = "open";
    e.openedAt = Date.now();
  }
  return e;
}

export function recordProviderSuccess(provider) {
  const e = entry(provider);
  e.successStreak += 1;
  if (e.successStreak >= 3) {
    e.failures = 0;
    e.state = "closed";
    e.openedAt = null;
  }
  return e;
}

export function clearProviderFailure(provider) {
  _state.delete(provider);
}

/** Snapshot of all circuit-breaker statuses, keyed by provider. */
export function getAllCircuitBreakerStatuses() {
  const out = {};
  for (const [provider, e] of _state) {
    out[provider] = {
      state: e.state,
      failureCount: e.failures,
      lastFailureTime: e.openedAt,
      retryAfterMs: e.openedAt ? Math.max(0, 60_000 - (Date.now() - e.openedAt)) : null,
    };
  }
  return out;
}
