import {
  SlidingWindowLimiter
} from "./slidingWindowLimiter.js";
function createAbortError(signal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  error.name = "AbortError";
  if (reason !== void 0) error.cause = reason;
  return error;
}
function sleepOrAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(createAbortError(signal));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
function keyContainsConnection(key, connectionId) {
  const marker = `:${connectionId}`;
  return key.endsWith(marker) || key.includes(`${marker}:`);
}
class RollingRpmGate {
  constructor(options) {
    this.options = options;
  }
  limiter = new SlidingWindowLimiter();
  blockedUntil = /* @__PURE__ */ new Map();
  learnedHeaderWindows = /* @__PURE__ */ new Map();
  windowMs = 6e4;
  async acquire(provider, connectionId, model, signal, maxWaitMs, startedAt) {
    const blockKey = this.options.getLimiterKey(provider, connectionId, model);
    let scopes = this.getScopes(provider, connectionId, model);
    if (scopes.length === 0 && (this.blockedUntil.get(blockKey) ?? 0) <= Date.now()) {
      return null;
    }
    for (; ; ) {
      if (signal?.aborted) throw createAbortError(signal);
      scopes = this.getScopes(provider, connectionId, model);
      if (scopes.length === 0 && (this.blockedUntil.get(blockKey) ?? 0) <= Date.now()) {
        return null;
      }
      const now = Date.now();
      const blockedUntil = this.blockedUntil.get(blockKey) ?? 0;
      if (blockedUntil <= now) this.blockedUntil.delete(blockKey);
      let scopeBlockedUntil = 0;
      for (const scope of scopes) {
        const scopeBlocked = this.blockedUntil.get(scope.key) ?? 0;
        if (scopeBlocked > now) scopeBlockedUntil = Math.max(scopeBlockedUntil, scopeBlocked);
        else if (scopeBlocked > 0) this.blockedUntil.delete(scope.key);
      }
      const forcedWaitMs = Math.max(0, blockedUntil - now, scopeBlockedUntil - now);
      if (forcedWaitMs === 0) {
        const result = this.limiter.tryAcquireMany(scopes);
        if (result.allowed) return result.lease ?? null;
        const retryAfterMs = Math.max(1, result.retryAfterMs);
        const remainingMs2 = maxWaitMs > 0 ? maxWaitMs - (now - startedAt) : retryAfterMs;
        if (maxWaitMs > 0 && remainingMs2 <= 0) {
          throw this.options.createQueueTimeoutError(provider, model, maxWaitMs);
        }
        await sleepOrAbort(
          Math.min(retryAfterMs, maxWaitMs > 0 ? remainingMs2 : retryAfterMs),
          signal
        );
        continue;
      }
      const remainingMs = maxWaitMs > 0 ? maxWaitMs - (now - startedAt) : forcedWaitMs;
      if (maxWaitMs > 0 && remainingMs <= 0) {
        throw this.options.createQueueTimeoutError(provider, model, maxWaitMs, "upstream-cooldown");
      }
      await sleepOrAbort(
        Math.min(forcedWaitMs, maxWaitMs > 0 ? remainingMs : forcedWaitMs),
        signal
      );
    }
  }
  block(provider, connectionId, model, retryAfterMs) {
    if (retryAfterMs > 0) {
      const key = this.options.getLimiterKey(provider, connectionId, model);
      this.blockedUntil.set(key, Date.now() + retryAfterMs);
    }
  }
  learnHeaderWindow(provider, connectionId, model, requests, windowMs, expiresAt) {
    const key = `header:${this.options.getLimiterKey(provider, connectionId, model)}`;
    if (requests <= 0) {
      this.learnedHeaderWindows.delete(key);
      this.blockedUntil.set(key, expiresAt);
      return;
    }
    this.blockedUntil.delete(key);
    this.learnedHeaderWindows.set(key, {
      window: { requests, windowMs },
      expiresAt
    });
  }
  clearLearnedHeaderWindow(provider, connectionId, model) {
    const key = `header:${this.options.getLimiterKey(provider, connectionId, model)}`;
    this.learnedHeaderWindows.delete(key);
    this.blockedUntil.delete(key);
  }
  clearConnection(connectionId) {
    for (const key of this.blockedUntil.keys()) {
      if (keyContainsConnection(key, connectionId)) this.blockedUntil.delete(key);
    }
    for (const key of this.learnedHeaderWindows.keys()) {
      if (keyContainsConnection(key, connectionId)) this.learnedHeaderWindows.delete(key);
    }
  }
  reset() {
    this.limiter.reset();
    this.blockedUntil.clear();
    this.learnedHeaderWindows.clear();
  }
  cleanupExpired(now = Date.now()) {
    for (const [key, expiresAt] of this.blockedUntil) {
      if (expiresAt <= now) this.blockedUntil.delete(key);
    }
    for (const [key, window] of this.learnedHeaderWindows) {
      if (window.expiresAt <= now) this.learnedHeaderWindows.delete(key);
    }
  }
  getScopes(provider, connectionId, model) {
    const scopes = [];
    const globalRpm = this.options.getGlobalRpm();
    if (typeof globalRpm === "number" && globalRpm > 0) {
      scopes.push({
        key: "global",
        window: { requests: globalRpm, windowMs: this.windowMs }
      });
    }
    const providerWindow = this.options.getProviderWindow(provider);
    if (providerWindow) scopes.push({ key: `provider:${provider}`, window: providerWindow });
    const connectionRpm = this.options.getConnectionRpm(connectionId);
    if (typeof connectionRpm === "number" && connectionRpm > 0) {
      scopes.push({
        key: `provider-account:${provider}:${connectionId}`,
        window: { requests: connectionRpm, windowMs: this.windowMs }
      });
    }
    const headerKey = `header:${this.options.getLimiterKey(provider, connectionId, model)}`;
    const headerBlockedUntil = this.blockedUntil.get(headerKey) ?? 0;
    const headerRemainingMs = headerBlockedUntil - Date.now();
    if (headerRemainingMs > 0) {
      scopes.push({
        key: headerKey,
        window: { requests: 1, windowMs: headerRemainingMs }
      });
      return scopes;
    }
    if (headerBlockedUntil > 0) this.blockedUntil.delete(headerKey);
    const headerWindow = this.learnedHeaderWindows.get(headerKey);
    if (headerWindow) {
      if (headerWindow.expiresAt > Date.now()) {
        scopes.push({ key: headerKey, window: headerWindow.window });
      } else {
        this.learnedHeaderWindows.delete(headerKey);
      }
    }
    return scopes;
  }
}
export {
  RollingRpmGate,
  keyContainsConnection
};
