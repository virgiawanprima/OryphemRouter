import { setTimeout as sleep } from "node:timers/promises";
import { SessionFactory } from "./sessionFactory.js";
import {
  DEFAULT_POOL_CONFIG
} from "./types.js";
class SessionPool {
  provider;
  poolId;
  createdAt;
  sessions = [];
  index = 0;
  config;
  factory;
  // Aggregate stats
  totalRequests = 0;
  successfulRequests = 0;
  rate429count = 0;
  otherErrors = 0;
  // Track throughput
  startTime = Date.now();
  lastLog = 0;
  constructor(provider, config, factory) {
    this.provider = provider;
    this.poolId = `pool-${provider}-${Date.now().toString(36)}`;
    this.createdAt = Date.now();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.factory = factory ?? new SessionFactory(this.config);
  }
  // ─── Pool Lifecycle ──────────────────────────────────────────────────
  /** Ensure the pool has at least minSessions ready */
  async ensureMinSessions() {
    const needed = this.config.minSessions - this.sessions.length;
    if (needed <= 0) return;
    const promises = [];
    for (let i = 0; i < needed; i++) {
      promises.push(Promise.resolve(this.createSession()));
    }
    await Promise.allSettled(promises);
  }
  /** Warm up the pool to a specific size (bypasses minSessions limit) */
  async warmUp(count) {
    const target = Math.min(count, this.config.maxSessions);
    const needed = target - this.sessions.length;
    if (needed <= 0) return;
    const promises = [];
    for (let i = 0; i < needed; i++) {
      promises.push(Promise.resolve(this.createSession()));
    }
    await Promise.allSettled(promises);
  }
  /** Graceful shutdown — mark all sessions dead */
  async shutdown() {
    for (const s of this.sessions) {
      s.markDead();
    }
    this.sessions = [];
  }
  // ─── Acquire / Release ───────────────────────────────────────────────
  /**
   * Acquire the next available session (round-robin with availability check).
   * Returns null if no sessions are available (all on cooldown/dead).
   */
  acquire() {
    if (this.sessions.length === 0) return null;
    const startIdx = this.index % this.sessions.length;
    for (let i = 0; i < this.sessions.length; i++) {
      const idx = (startIdx + i) % this.sessions.length;
      const session = this.sessions[idx];
      if (session.isAvailable) {
        this.index = (idx + 1) % this.sessions.length;
        session.acquire();
        this.totalRequests++;
        return session;
      }
    }
    if (this.sessions.length < this.config.maxSessions) {
      const session = this.createSession();
      session.acquire();
      this.totalRequests++;
      return session;
    }
    return null;
  }
  /**
   * Report a successful request. Updates metrics pool-wide and per-session.
   */
  reportSuccess(session) {
    session.markSuccess();
    this.successfulRequests++;
  }
  /**
   * Report a rate-limit (429). Puts the session into exponential-backoff cooldown.
   */
  reportCooldown(session) {
    session.markCooldown();
    this.rate429count++;
    this.maybeLog();
  }
  /**
   * Report a non-recoverable error. Marks session as dead.
   */
  reportDead(session) {
    session.markDead();
    this.otherErrors++;
  }
  // ─── Health / Stats ──────────────────────────────────────────────────
  /** Count of available (active, not in cooldown) sessions */
  get availableCount() {
    return this.sessions.filter((s) => s.isAvailable).length;
  }
  /** Number of sessions currently in cooldown */
  get cooldownCount() {
    return this.sessions.filter((s) => s.status === "cooldown").length;
  }
  /** Number of dead sessions */
  get deadCount() {
    return this.sessions.filter((s) => s.status === "dead").length;
  }
  /** Total sessions managed */
  get totalCount() {
    return this.sessions.length;
  }
  /** Current throughput in req/s */
  get currentThroughput() {
    const elapsed = (Date.now() - this.startTime) / 1e3;
    return elapsed > 0 ? this.totalRequests / elapsed : 0;
  }
  /** Snapshot for dashboard/API */
  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1e3;
    return {
      provider: this.provider,
      sessions: {
        total: this.sessions.length,
        active: this.availableCount,
        cooldown: this.cooldownCount,
        dead: this.deadCount
      },
      requests: {
        total: this.totalRequests,
        success: this.successfulRequests,
        rate429: this.rate429count,
        otherErrors: this.otherErrors
      },
      throughput: this.currentThroughput.toFixed(1),
      successRate: this.totalRequests > 0 ? (this.successfulRequests / this.totalRequests * 100).toFixed(1) : "100.0",
      elapsed: elapsed.toFixed(0)
    };
  }
  /** Per-session details */
  getSessionDetails() {
    return this.sessions.map((s) => ({
      id: s.id,
      fingerprint: s.fingerprint.id,
      status: s.status,
      totalRequests: s.totalRequests,
      successfulRequests: s.successfulRequests,
      successRate: s.totalRequests > 0 ? (s.successfulRequests / s.totalRequests * 100).toFixed(1) : "100.0",
      inflight: s.inflight,
      cooldownRemaining: s.cooldownRemaining > 0 ? `${(s.cooldownRemaining / 1e3).toFixed(1)}s` : "0s",
      age: `${(s.age / 1e3).toFixed(0)}s`
    }));
  }
  /** As acquire(), but blocks until a session is available */
  async acquireBlocking(timeoutMs = 1e4) {
    const deadline = Date.now() + timeoutMs;
    const fast = this.acquire();
    if (fast) return fast;
    let delay = 50;
    while (Date.now() < deadline) {
      await sleep(delay);
      const session = this.acquire();
      if (session) return session;
      delay = Math.min(delay * 2, 200);
    }
    throw new Error(
      `[SessionPool:${this.provider}] No session available after ${timeoutMs}ms timeout`
    );
  }
  /** As acquireBlocking(), but accepts arbitrary function to wrap */
  async executeWithSession(fn, timeoutMs = 1e4) {
    const session = await this.acquireBlocking(timeoutMs);
    try {
      const result = await fn(session);
      return result;
    } finally {
      session.release();
    }
  }
  // ─── Internal ────────────────────────────────────────────────────────
  /** Create and register a new session */
  createSession() {
    const session = this.factory.createSession();
    this.sessions.push(session);
    return session;
  }
  /** Periodic log of pool health (every 5s) */
  maybeLog() {
    const now = Date.now();
    if (now - this.lastLog < 5e3) return;
    this.lastLog = now;
    const stats = this.getStats();
    if (stats.requests.total % 50 === 0) {
    }
  }
  /** Remove dead sessions and idle sessions older than maxIdleMs */
  pruneDeadSessions(maxIdleMs = 3e5) {
    const now = Date.now();
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => {
      if (s.status === "dead") return false;
      if (s.inflight === 0 && s.lastUsedAt > 0 && now - s.lastUsedAt > maxIdleMs) return false;
      return true;
    });
    if (this.sessions.length < before && this.sessions.length < this.config.minSessions) {
      this.ensureMinSessions();
    }
  }
  /** Start periodic pruning (every 60s) */
  startAutoPrune(intervalMs = 6e4) {
    const timer = setInterval(() => this.pruneDeadSessions(), intervalMs);
    timer.unref();
    return timer;
  }
}
export {
  SessionPool
};
