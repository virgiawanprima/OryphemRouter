const WATCHDOG_INTERVAL_MS = 3e4;
const INACTIVE_LIMITER_MS = 10 * 60 * 1e3;
const IDLE_CAPACITY_WEDGE_GRACE_MS = 1e4;
class LimiterWedgeWatchdog {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  queueProgressAt = /* @__PURE__ */ new WeakMap();
  evictions = /* @__PURE__ */ new WeakMap();
  currentRun = null;
  noteQueued(key, limiter) {
    if (this.dependencies.limiters.get(key) !== limiter) return;
    if (!this.queueProgressAt.has(limiter)) this.queueProgressAt.set(limiter, Date.now());
  }
  noteProgress(key, limiter) {
    if (this.dependencies.limiters.get(key) !== limiter) return;
    if (limiter.counts().QUEUED > 0) {
      this.queueProgressAt.set(limiter, Date.now());
    } else {
      this.queueProgressAt.delete(limiter);
    }
  }
  forget(limiter) {
    this.queueProgressAt.delete(limiter);
  }
  getEviction(limiter) {
    return this.evictions.get(limiter);
  }
  run(now = Date.now()) {
    if (this.currentRun) return this.currentRun;
    const run = this.tick(now);
    this.currentRun = run;
    void run.then(
      () => {
        if (this.currentRun === run) this.currentRun = null;
      },
      () => {
        if (this.currentRun === run) this.currentRun = null;
      }
    );
    return run;
  }
  reset() {
    this.queueProgressAt = /* @__PURE__ */ new WeakMap();
    this.evictions = /* @__PURE__ */ new WeakMap();
    this.currentRun = null;
  }
  async tick(now) {
    const { limiters, limiterLastUsed, log, trackBackground, warn } = this.dependencies;
    for (const [key, limiter] of Array.from(limiters)) {
      const lastUsed = limiterLastUsed.get(key) ?? 0;
      if (now - lastUsed <= INACTIVE_LIMITER_MS) continue;
      const counts = limiter.counts();
      if (counts.QUEUED > 0 || counts.RUNNING > 0 || counts.EXECUTING > 0) continue;
      limiters.delete(key);
      this.queueProgressAt.delete(limiter);
      limiterLastUsed.delete(key);
      log(
        `[RATE-LIMIT] Evicting idle limiter: ${key} (inactive for ${Math.round((now - lastUsed) / 1e3)}s)`
      );
      trackBackground(limiter.disconnect());
    }
    for (const [key, limiter] of Array.from(limiters)) {
      const snapshot = await this.getStableIdleCapacity(key, limiter, now);
      if (!snapshot) continue;
      const counts = limiter.counts();
      const cleanup = this.evict(key, limiter, snapshot);
      if (!cleanup) continue;
      warn(
        `[RATE-LIMIT] WEDGED: ${key} queued=${counts.QUEUED} running=0 executing=0 stalled=${now - snapshot.lastProgress}ms with idle capacity \u2014 force-resetting`
      );
      await cleanup;
    }
  }
  async getStableIdleCapacity(key, limiter, now) {
    const before = limiter.counts();
    if (before.QUEUED === 0) {
      this.queueProgressAt.delete(limiter);
      return null;
    }
    if (before.RUNNING > 0 || before.EXECUTING > 0) return null;
    const lastProgress = this.queueProgressAt.get(limiter);
    if (lastProgress === void 0) {
      this.queueProgressAt.set(limiter, now);
      return null;
    }
    if (now - lastProgress < IDLE_CAPACITY_WEDGE_GRACE_MS) return null;
    let canRunNow;
    let reservoir;
    try {
      canRunNow = await limiter.check(1);
      if (!canRunNow) return null;
      reservoir = await limiter.currentReservoir();
    } catch {
      return null;
    }
    if (this.dependencies.limiters.get(key) !== limiter) return null;
    const after = limiter.counts();
    if (after.QUEUED === 0 || after.RUNNING > 0 || after.EXECUTING > 0 || this.queueProgressAt.get(limiter) !== lastProgress) {
      return null;
    }
    return { lastProgress, reservoir };
  }
  evict(key, limiter, snapshot) {
    const { limiterEffectiveSettings, limiterLastUsed, limiters, preservedReplacementSettings } = this.dependencies;
    if (limiters.get(key) !== limiter) return null;
    const counts = limiter.counts();
    if (counts.QUEUED === 0 || counts.RUNNING > 0 || counts.EXECUTING > 0 || this.queueProgressAt.get(limiter) !== snapshot.lastProgress) {
      return null;
    }
    const effectiveSettings = limiterEffectiveSettings.get(limiter) ?? {};
    preservedReplacementSettings.set(key, {
      ...effectiveSettings,
      id: key,
      // Carry consumed capacity forward. Restarting the refresh interval from
      // replacement creation is conservative and cannot grant an early burst.
      reservoir: snapshot.reservoir
    });
    limiters.delete(key);
    this.queueProgressAt.delete(limiter);
    limiterLastUsed.delete(key);
    const stopped = Promise.resolve().then(
      () => limiter.stop({
        dropWaitingJobs: true,
        dropErrorMessage: "rate-limit-watchdog-wedge-reset"
      })
    );
    const cleanup = stopped.then(
      () => limiter.disconnect(),
      async (stopError) => {
        await limiter.disconnect();
        throw stopError;
      }
    ).then(() => true);
    this.evictions.set(limiter, cleanup);
    return cleanup;
  }
}
export {
  LimiterWedgeWatchdog,
  WATCHDOG_INTERVAL_MS
};
