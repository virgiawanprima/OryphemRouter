import { SlidingWindowLimiter } from "./slidingWindowLimiter.js";
const PROVIDER_DEFAULT_RATE_LIMITS = {
  nvidia: { requests: 40, windowMs: 6e4 }
};
const PROVIDER_DEFAULT_CONCURRENCY_CAP = {
  nvidia: 6
};
let providerDefaultOverrides = null;
const limiter = new SlidingWindowLimiter();
let providerQuotaOverrides = null;
function __setProviderDefaultRateLimitsForTests(map) {
  providerDefaultOverrides = map;
  limiter.reset();
}
function setProviderQuotaOverrides(map) {
  providerQuotaOverrides = map;
}
function getProviderDefaultRateLimit(provider) {
  if (!provider) return void 0;
  const rpmOverride = providerQuotaOverrides?.[provider]?.rpm;
  if (typeof rpmOverride === "number" && rpmOverride > 0) {
    return { requests: rpmOverride, windowMs: 6e4 };
  }
  return (providerDefaultOverrides ?? PROVIDER_DEFAULT_RATE_LIMITS)[provider];
}
function getProviderConcurrencyCap(provider, fallback) {
  const override = providerQuotaOverrides?.[provider]?.concurrency;
  if (typeof override === "number" && override > 0) return override;
  const staticDefault = PROVIDER_DEFAULT_CONCURRENCY_CAP[provider];
  return typeof staticDefault === "number" && staticDefault > 0 ? staticDefault : fallback;
}
function acquireProviderDefaultSlot(provider, connectionId) {
  const cfg = getProviderDefaultRateLimit(provider);
  if (!cfg) return 0;
  const res = limiter.tryAcquire(`${provider}:${connectionId || "_"}`, cfg);
  return res.allowed ? 0 : Math.max(1, res.retryAfterMs);
}
function sleepOrAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    let onAbort = null;
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(timer);
        const reason = signal.reason;
        const err = reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
async function awaitProviderDefaultSlot(provider, connectionId, signal, maxWaitMs) {
  const cfg = getProviderDefaultRateLimit(provider);
  if (!cfg) return;
  const budget = Math.max(cfg.windowMs, maxWaitMs && maxWaitMs > 0 ? maxWaitMs : 0);
  const start = Date.now();
  for (; ; ) {
    const waitMs = acquireProviderDefaultSlot(provider, connectionId);
    if (waitMs === 0) return;
    if (Date.now() - start >= budget) return;
    await sleepOrAbort(Math.min(waitMs, budget), signal);
  }
}
export {
  PROVIDER_DEFAULT_CONCURRENCY_CAP,
  __setProviderDefaultRateLimitsForTests,
  acquireProviderDefaultSlot,
  awaitProviderDefaultSlot,
  getProviderConcurrencyCap,
  getProviderDefaultRateLimit,
  setProviderQuotaOverrides
};
