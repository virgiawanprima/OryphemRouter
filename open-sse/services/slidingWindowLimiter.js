const MAX_KEYS = 5e3;
class SlidingWindowLimiter {
  hits = /* @__PURE__ */ new Map();
  now;
  nextHitId = 1;
  constructor(opts = {}) {
    this.now = opts.now ?? Date.now;
  }
  /**
   * Try to consume one slot for `key`. Records a timestamp and returns
   * `{allowed:true}` when under the cap; returns `{allowed:false, retryAfterMs}`
   * (without recording) when the trailing window is saturated.
   */
  tryAcquire(key, window) {
    const result = this.tryAcquireMany([{ key, window }]);
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }
  /**
   * Acquire all supplied scopes atomically. No scope is recorded unless every
   * configured scope has capacity, preventing a global lease from being held
   * while a narrower provider/account lease is unavailable.
   */
  tryAcquireMany(scopes) {
    const activeScopes = scopes.filter(({ window }) => window.requests > 0 && window.windowMs > 0);
    if (activeScopes.length === 0) return { allowed: true, retryAfterMs: 0 };
    const now = this.now();
    const prepared = activeScopes.map((scope) => {
      const cutoff = now - scope.window.windowMs;
      const previous = this.hits.get(scope.key);
      const live = previous ? previous.filter((hit) => hit.timestamp > cutoff) : [];
      const retryAfterMs2 = live.length >= scope.window.requests ? Math.max(0, live[0].timestamp + scope.window.windowMs - now) : 0;
      return { scope, live, retryAfterMs: retryAfterMs2 };
    });
    const retryAfterMs = prepared.reduce((max, entry) => Math.max(max, entry.retryAfterMs), 0);
    for (const entry of prepared) this.set(entry.scope.key, entry.live);
    if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
    const entries = prepared.map((entry) => {
      const hit = { id: this.nextHitId++, timestamp: now };
      entry.live.push(hit);
      this.set(entry.scope.key, entry.live);
      return { key: entry.scope.key, id: hit.id };
    });
    let released = false;
    return {
      allowed: true,
      retryAfterMs: 0,
      lease: {
        release: () => {
          if (released) return;
          released = true;
          for (const entry of entries) {
            const live = this.hits.get(entry.key);
            if (!live) continue;
            const remaining = live.filter((hit) => hit.id !== entry.id);
            if (remaining.length > 0) this.hits.set(entry.key, remaining);
            else this.hits.delete(entry.key);
          }
        }
      }
    };
  }
  /** Clear history for one key, or all keys when called with no argument. */
  reset(key) {
    if (key === void 0) this.hits.clear();
    else this.hits.delete(key);
  }
  set(key, live) {
    if (live.length === 0) {
      this.hits.delete(key);
      return;
    }
    if (!this.hits.has(key) && this.hits.size >= MAX_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== void 0) this.hits.delete(oldest);
    }
    this.hits.set(key, live);
  }
}
export {
  SlidingWindowLimiter
};
