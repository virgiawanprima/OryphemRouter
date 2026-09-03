const DEFAULT_MIN_INTERVAL_MS = 250;
const MAX_MIN_INTERVAL_MS = 5e3;
const DEFAULT_JITTER_MS = 120;
const realClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};
class MinIntervalThrottle {
  minIntervalMs;
  jitterMs;
  clock;
  rand;
  lastStart = 0;
  chain = Promise.resolve();
  constructor(options) {
    this.minIntervalMs = Math.max(0, options.minIntervalMs);
    this.jitterMs = Math.max(0, options.jitterMs ?? 0);
    this.clock = options.clock ?? realClock;
    this.rand = options.rand ?? Math.random;
  }
  async acquire() {
    if (this.minIntervalMs <= 0) return;
    const prev = this.chain;
    let release;
    this.chain = new Promise((resolve) => {
      release = resolve;
    });
    try {
      await prev;
      const now = this.clock.now();
      if (this.lastStart !== 0) {
        const jitter = this.jitterMs > 0 ? Math.floor(this.rand() * this.jitterMs) : 0;
        const wait = this.lastStart + this.minIntervalMs + jitter - now;
        if (wait > 0) await this.clock.sleep(wait);
      }
      this.lastStart = this.clock.now();
    } finally {
      release();
    }
  }
}
function resolveQuotaFetchMinIntervalMs(env = process.env) {
  const raw = env.OMNIROUTE_QUOTA_FETCH_MIN_INTERVAL_MS;
  if (raw === void 0 || raw === null || raw.trim() === "") return DEFAULT_MIN_INTERVAL_MS;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MIN_INTERVAL_MS;
  return Math.min(Math.round(n), MAX_MIN_INTERVAL_MS);
}
let _sharedThrottle = null;
function getQuotaFetchThrottle() {
  if (!_sharedThrottle) {
    _sharedThrottle = new MinIntervalThrottle({
      minIntervalMs: resolveQuotaFetchMinIntervalMs(),
      jitterMs: DEFAULT_JITTER_MS
    });
  }
  return _sharedThrottle;
}
function throttleQuotaFetch() {
  return getQuotaFetchThrottle().acquire();
}
function resetQuotaFetchThrottle() {
  _sharedThrottle = null;
}
export {
  MinIntervalThrottle,
  getQuotaFetchThrottle,
  resetQuotaFetchThrottle,
  resolveQuotaFetchMinIntervalMs,
  throttleQuotaFetch
};
