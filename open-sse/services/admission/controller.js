import {
  clampLimit,
  closeAdaptationWindow,
  createAdaptationState,
  noteLatency,
  noteOutcome,
  sampleActiveIntegral,
  setPressure
} from "./adaptation.js";
import { validateConfig } from "./config.js";
import { estimateAdmissionCost, normalizeRequestCost } from "./cost.js";
import { FairCostQueue } from "./queue.js";
import {
  MAX_ADMISSION_WINDOW_MS,
  createAdmissionRejectError
} from "./types.js";
const ADMISSION_LANE_TTL_MS = 6e4;
const ADMISSION_LANE_MAX_SESSIONS = 1e3;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
function saturateSnapshotNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return Math.floor(value);
}
function bigintToSnapshotNumber(value) {
  if (value <= 0n) return 0;
  if (value >= MAX_SAFE_BIGINT) return Number.MAX_SAFE_INTEGER;
  return Number(value);
}
function addSaturated(total, delta) {
  if (delta <= 0) return saturateSnapshotNumber(total);
  if (total >= Number.MAX_SAFE_INTEGER - delta) return Number.MAX_SAFE_INTEGER;
  return total + delta;
}
let leaseSeq = 0;
function nextId(prefix) {
  leaseSeq += 1;
  return `${prefix}-${leaseSeq}`;
}
function defaultClock() {
  return {
    now: () => Date.now(),
    setTimer: (fn, delayMs) => {
      const handle = setTimeout(fn, delayMs);
      if (typeof handle.unref === "function") handle.unref();
      return handle;
    },
    clearTimer: (id) => clearTimeout(id)
  };
}
class AdaptiveAdmissionController {
  config;
  clock;
  adaptation;
  queue;
  virtualQueue;
  /** Per-tenant virtual admission lanes (#9654). */
  virtualLanes = /* @__PURE__ */ new Map();
  /** Eviction timer for idle lanes; re-armed when a lane is created. */
  laneEvictionTimer = void 0;
  active = /* @__PURE__ */ new Map();
  activeCost = 0n;
  virtualActiveCost = 0;
  virtualActiveCount = 0;
  lastSampleMs;
  windowTimer = void 0;
  shutDown = false;
  admittedCount = 0;
  rejectedCount = 0;
  wouldAdmitCount = 0;
  wouldQueueCount = 0;
  wouldRejectCount = 0;
  constructor(config, clock) {
    this.config = validateConfig(config);
    this.clock = {
      now: clock?.now ?? defaultClock().now,
      setTimer: clock?.setTimer ?? defaultClock().setTimer,
      clearTimer: clock?.clearTimer ?? defaultClock().clearTimer
    };
    const now = this.clock.now();
    this.adaptation = createAdaptationState(
      this.config.initialLimit,
      this.config.minLimit,
      this.config.maxLimit,
      now
    );
    this.queue = new FairCostQueue(this.config.maxQueueCount, this.config.maxQueueCost);
    this.virtualQueue = new FairCostQueue(this.config.maxQueueCount, this.config.maxQueueCost);
    this.lastSampleMs = now;
    this.armWindowTimer();
  }
  updateConfig(config) {
    const next = validateConfig(config);
    this.sampleIntegral();
    this.config = next;
    this.adaptation.currentLimit = Math.min(
      next.maxLimit,
      Math.max(next.minLimit, this.adaptation.currentLimit)
    );
    this.adaptation.recoveryCeiling = clampLimit(next.initialLimit, next.minLimit, next.maxLimit);
    this.adaptation.windowStartMs = this.clock.now();
    this.adaptation.windowActiveCostIntegral = 0;
    this.adaptation.windowCompleted = 0;
    this.adaptation.windowLatencySamples = 0;
    this.adaptation.freezeGrowth = false;
    this.adaptation.criticalDecreaseConsumed = false;
    this.adaptation.pressure = "normal";
    this.lastSampleMs = this.clock.now();
    const drained = this.queue.drain();
    this.queue = new FairCostQueue(next.maxQueueCount, next.maxQueueCost);
    for (const [, lane] of this.virtualLanes) {
      for (const entry of lane.queue.drain()) {
        drained.push(entry);
      }
    }
    this.virtualLanes.clear();
    this.clearLaneEviction();
    for (const entry of drained) {
      if (next.mode !== "enforce") {
        this.clearEntryTimer(entry);
        this.detachAbort(entry);
        entry.payload.resolve(this.admit(entry.cost));
        continue;
      }
      if (entry.cost > this.adaptation.currentLimit) {
        this.failQueued(
          entry,
          "ADMISSION_OVERSIZED",
          "request cost exceeds max budget after config update"
        );
        continue;
      }
      if (!this.queue.enqueue(entry)) {
        this.failQueued(entry, "ADMISSION_QUEUE_FULL", "queue capacity reduced");
      }
    }
    this.rebuildVirtualState(next.mode === "shadow");
    this.armWindowTimer();
    if (next.mode === "enforce") {
      this.dispatch();
    }
  }
  snapshot() {
    this.sampleIntegral();
    return {
      mode: this.config.mode,
      currentLimit: this.adaptation.currentLimit,
      minLimit: this.config.minLimit,
      maxLimit: this.config.maxLimit,
      activeCost: bigintToSnapshotNumber(this.activeCost),
      activeCount: saturateSnapshotNumber(this.active.size),
      queuedCost: saturateSnapshotNumber(this.queue.totalCost),
      queuedCount: saturateSnapshotNumber(this.queue.size),
      virtualActiveCost: saturateSnapshotNumber(this.virtualActiveCost),
      virtualActiveCount: saturateSnapshotNumber(this.virtualActiveCount),
      virtualQueuedCost: saturateSnapshotNumber(this.virtualQueue.totalCost),
      virtualQueuedCount: saturateSnapshotNumber(this.virtualQueue.size),
      virtualLanes: this.config.virtualLanes === true,
      laneCount: saturateSnapshotNumber(this.virtualLanes.size),
      laneQueuedCost: saturateSnapshotNumber(this.laneTotalQueuedCost()),
      laneQueuedCount: saturateSnapshotNumber(this.laneTotalQueuedCount()),
      laneTenants: this.laneTenantSnapshot(),
      admittedCount: saturateSnapshotNumber(this.admittedCount),
      rejectedCount: saturateSnapshotNumber(this.rejectedCount),
      wouldAdmitCount: saturateSnapshotNumber(this.wouldAdmitCount),
      wouldQueueCount: saturateSnapshotNumber(this.wouldQueueCount),
      wouldRejectCount: saturateSnapshotNumber(this.wouldRejectCount),
      shortLatencyEwma: this.adaptation.shortLatencyEwma,
      longLatencyEwma: this.adaptation.longLatencyEwma,
      utilization: this.adaptation.utilization,
      pressure: this.adaptation.pressure,
      shutdown: this.shutDown
    };
  }
  observePressure(pressure) {
    setPressure(this.adaptation, pressure);
    if (pressure === "critical") {
      if (!this.adaptation.criticalDecreaseConsumed) {
        this.adaptation.currentLimit = Math.max(
          this.config.minLimit,
          Math.floor(this.adaptation.currentLimit * this.config.adaptation.criticalDecreaseFactor)
        );
        this.adaptation.criticalDecreaseConsumed = true;
        this.dispatch();
        this.dispatchVirtual();
      }
    }
  }
  /** Deterministic window tick for tests / injected clocks. */
  tick() {
    this.sampleIntegral();
    this.evictIdleLanes();
    closeAdaptationWindow(this.adaptation, this.config.adaptation, this.clock.now());
    this.dispatch();
    this.dispatchVirtual();
  }
  async acquire(request) {
    if (this.shutDown) {
      return this.reject("ADMISSION_SHUTDOWN", "admission controller is shut down");
    }
    if (request.signal?.aborted) {
      return this.reject("ADMISSION_ABORTED", "request aborted before acquire");
    }
    if (request.pressure) setPressure(this.adaptation, request.pressure);
    const cost = this.resolveCost(request);
    const mode = this.config.mode;
    if (mode === "off") {
      return this.admitVirtual(cost);
    }
    const limit = this.adaptation.currentLimit;
    if (mode === "shadow") {
      return this.acquireShadow(request, cost, limit);
    }
    if (cost > limit) {
      if (this.shouldAdmitSolo(cost)) {
        return this.admit(cost);
      }
      return this.reject("ADMISSION_OVERSIZED", "request cost exceeds max budget");
    }
    if (this.queue.size === 0 && this.activeCost + BigInt(cost) <= BigInt(limit)) {
      return this.admit(cost);
    }
    if (!this.queue.canAccept(cost)) {
      return this.reject("ADMISSION_QUEUE_FULL", "admission queue is full");
    }
    return this.enqueue(request, cost);
  }
  shutdown() {
    if (this.shutDown) return;
    this.shutDown = true;
    if (this.windowTimer !== void 0) {
      this.clock.clearTimer(this.windowTimer);
      this.windowTimer = void 0;
    }
    const drained = this.queue.drain();
    for (const entry of drained) {
      this.clearEntryTimer(entry);
      this.detachAbort(entry);
      entry.payload.reject(
        createAdmissionRejectError("ADMISSION_SHUTDOWN", "admission controller shut down")
      );
      this.rejectedCount += 1;
    }
    for (const [, lane] of this.virtualLanes) {
      for (const entry of lane.queue.drain()) {
        this.clearEntryTimer(entry);
        this.detachAbort(entry);
        entry.payload.reject(
          createAdmissionRejectError("ADMISSION_SHUTDOWN", "admission controller shut down")
        );
        this.rejectedCount += 1;
      }
    }
    this.virtualLanes.clear();
    this.clearLaneEviction();
  }
  /**
   * #10111: whether a request that currently exceeds the temporary aggregate limit may run
   * solo. True only when the request fits the healthy aggregate ceiling (maxLimit), the
   * system is otherwise idle (no active/queued/lane work) and pressure is normal — so an
   * individually-valid request is not terminally rejected as oversized just because a
   * latency-gradient decrease collapsed the temporary limit. Under genuine load, critical
   * pressure, or an over-ceiling request the caller falls through to the terminal reject.
   */
  shouldAdmitSolo(cost) {
    return cost <= this.config.maxLimit && this.active.size === 0 && this.queue.size === 0 && this.laneTotalQueuedCount() === 0 && this.adaptation.pressure === "normal";
  }
  resolveCost(request) {
    if (request.cost !== void 0) {
      return normalizeRequestCost(request.cost, this.config.maxRequestCost);
    }
    if (request.features) {
      return estimateAdmissionCost(request.features, this.config.costConfig);
    }
    return 1;
  }
  acquireShadow(request, cost, limit) {
    let decision;
    let disposition;
    if (cost > limit || !Number.isSafeInteger(cost)) {
      decision = "would-reject";
      disposition = "rejected";
      this.wouldRejectCount += 1;
    } else if (this.virtualActiveCost + cost <= limit) {
      decision = "would-admit";
      disposition = "active";
      this.virtualActiveCost = addSaturated(this.virtualActiveCost, cost);
      this.virtualActiveCount = addSaturated(this.virtualActiveCount, 1);
      this.wouldAdmitCount = addSaturated(this.wouldAdmitCount, 1);
    } else if (this.virtualQueue.canAccept(cost)) {
      decision = "would-queue";
      disposition = "queued";
      this.wouldQueueCount += 1;
    } else {
      decision = "would-reject";
      disposition = "rejected";
      this.wouldRejectCount += 1;
    }
    const admitted = this.admit(cost, disposition);
    if (disposition === "queued") {
      this.virtualQueue.enqueue({
        id: admitted.lease.id,
        tenantKey: request.tenantKey || "_default",
        cost,
        enqueuedAtMs: this.clock.now(),
        deadlineMs: Number.MAX_SAFE_INTEGER,
        payload: { recordId: admitted.lease.id }
      });
    }
    return { ...admitted, shadowDecision: decision };
  }
  admitVirtual(cost) {
    const id = nextId("lease");
    const lease = {
      id,
      cost,
      get released() {
        return true;
      },
      release: () => {
      }
    };
    this.admittedCount += 1;
    return { status: "admitted", lease };
  }
  admit(cost, virtualDisposition = "none") {
    this.sampleIntegral();
    const id = nextId("lease");
    const record = {
      id,
      cost,
      released: false,
      admittedAtMs: this.clock.now(),
      virtualDisposition
    };
    this.active.set(id, record);
    this.activeCost += BigInt(cost);
    this.admittedCount += 1;
    const controller = this;
    const lease = {
      id,
      cost,
      get released() {
        return record.released;
      },
      release(outcome = "success", meta) {
        controller.releaseLease(record, outcome, meta);
      }
    };
    return { status: "admitted", lease };
  }
  releaseLease(record, outcome, meta) {
    if (record.released) return;
    record.released = true;
    this.sampleIntegral();
    if (this.active.has(record.id)) {
      this.active.delete(record.id);
      this.activeCost -= BigInt(record.cost);
    }
    const latency = meta?.latencyMs !== void 0 ? meta.latencyMs : Math.max(0, this.clock.now() - record.admittedAtMs);
    noteLatency(this.adaptation, latency, this.config.adaptation);
    noteOutcome(this.adaptation, outcome);
    this.adaptation.windowCompleted += 1;
    if (meta?.pressure) setPressure(this.adaptation, meta.pressure);
    this.releaseVirtual(record);
    this.dispatch();
  }
  enqueue(request, cost) {
    const id = nextId("q");
    const maxWait = normalizeRequestCost(
      request.maxWaitMs ?? this.config.defaultMaxWaitMs,
      MAX_ADMISSION_WINDOW_MS
    );
    const now = this.clock.now();
    const deadlineMs = Math.min(Number.MAX_SAFE_INTEGER, now + maxWait);
    let settle;
    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    const entry = {
      id,
      tenantKey: request.tenantKey && request.tenantKey.length > 0 ? request.tenantKey : "_default",
      cost,
      enqueuedAtMs: now,
      deadlineMs,
      payload: {
        resolve: (v) => settle.resolve(v),
        reject: (e) => settle.reject(e),
        signal: request.signal
      }
    };
    if (entry.tenantKey !== "_default" && this.config.virtualLanes) {
      const lane = this.getOrCreateLane(entry.tenantKey);
      if (!lane.queue.enqueue(entry)) {
        this.removeEmptyLane(entry.tenantKey);
        return this.reject("ADMISSION_QUEUE_FULL", "admission lane queue is full");
      }
      this.armLaneEviction();
    } else if (!this.queue.enqueue(entry)) {
      return this.reject("ADMISSION_QUEUE_FULL", "admission queue is full");
    }
    this.dispatch();
    entry.timerId = this.clock.setTimer(
      () => {
        this.expireEntry(id, "ADMISSION_DEADLINE", "admission wait deadline exceeded");
      },
      Math.max(0, deadlineMs - now)
    );
    if (request.signal) {
      const onAbort = () => {
        this.expireEntry(id, "ADMISSION_ABORTED", "request aborted while queued");
      };
      entry.payload.onAbort = onAbort;
      request.signal.addEventListener("abort", onAbort, { once: true });
    }
    this.dispatch();
    return { status: "queued", promise };
  }
  expireEntry(id, code, message) {
    let entry = this.queue.removeById(id);
    if (!entry) {
      for (const [, lane] of this.virtualLanes) {
        entry = lane.queue.removeById(id);
        if (entry) {
          this.removeEmptyLane(entry.tenantKey);
          break;
        }
      }
    }
    if (!entry) return;
    this.clearEntryTimer(entry);
    this.detachAbort(entry);
    entry.payload.reject(createAdmissionRejectError(code, message));
    this.rejectedCount += 1;
    this.dispatch();
  }
  failQueued(entry, code, message) {
    this.clearEntryTimer(entry);
    this.detachAbort(entry);
    entry.payload.reject(createAdmissionRejectError(code, message));
    this.rejectedCount += 1;
  }
  dispatch() {
    if (this.shutDown || this.config.mode !== "enforce") return;
    while (this.queue.size > 0) {
      const limit = this.adaptation.currentLimit;
      const available = BigInt(limit) - this.activeCost;
      if (available <= 0n) return;
      const entry = this.queue.dequeue(Number(available));
      if (!entry) return;
      this.clearEntryTimer(entry);
      this.detachAbort(entry);
      if (entry.payload.signal?.aborted) {
        entry.payload.reject(
          createAdmissionRejectError("ADMISSION_ABORTED", "request aborted while queued")
        );
        this.rejectedCount += 1;
        continue;
      }
      if (this.clock.now() >= entry.deadlineMs) {
        entry.payload.reject(
          createAdmissionRejectError("ADMISSION_DEADLINE", "admission wait deadline exceeded")
        );
        this.rejectedCount += 1;
        continue;
      }
      entry.payload.resolve(this.admit(entry.cost));
    }
    this.dispatchLanes();
  }
  /** Round-robin dispatch across per-tenant virtual lane queues (#9654). */
  dispatchLanes() {
    if (this.shutDown || this.config.mode !== "enforce") return;
    if (this.virtualLanes.size === 0) return;
    const keys = Array.from(this.virtualLanes.keys());
    for (const key of keys) {
      const lane = this.virtualLanes.get(key);
      if (!lane) continue;
      while (lane.queue.size > 0) {
        const limit = this.adaptation.currentLimit;
        const available = BigInt(limit) - this.activeCost;
        if (available <= 0n) return;
        const entry = lane.queue.dequeue(Number(available));
        if (!entry) break;
        this.clearEntryTimer(entry);
        this.detachAbort(entry);
        if (entry.payload.signal?.aborted) {
          entry.payload.reject(
            createAdmissionRejectError("ADMISSION_ABORTED", "request aborted while queued")
          );
          this.rejectedCount += 1;
          continue;
        }
        if (this.clock.now() >= entry.deadlineMs) {
          entry.payload.reject(
            createAdmissionRejectError("ADMISSION_DEADLINE", "admission wait deadline exceeded")
          );
          this.rejectedCount += 1;
          continue;
        }
        entry.payload.resolve(this.admit(entry.cost));
        break;
      }
      this.removeEmptyLane(key);
    }
  }
  getOrCreateLane(tenantKey) {
    let lane = this.virtualLanes.get(tenantKey);
    if (!lane) {
      if (this.virtualLanes.size >= ADMISSION_LANE_MAX_SESSIONS) {
        const oldestKey = this.oldestLaneKey();
        if (oldestKey) {
          this.deleteLane(oldestKey);
        }
      }
      lane = {
        queue: new FairCostQueue(this.config.maxQueueCount, this.config.maxQueueCost),
        lastUsedMs: this.clock.now()
      };
      this.virtualLanes.set(tenantKey, lane);
    }
    lane.lastUsedMs = this.clock.now();
    return lane;
  }
  removeEmptyLane(tenantKey) {
    const lane = this.virtualLanes.get(tenantKey);
    if (lane && lane.queue.size === 0) {
      this.virtualLanes.delete(tenantKey);
    }
  }
  /** Drain and reject all pending entries in a lane before removing it from the map. */
  deleteLane(tenantKey) {
    const lane = this.virtualLanes.get(tenantKey);
    if (!lane) return;
    for (const entry of lane.queue.drain()) {
      this.clearEntryTimer(entry);
      this.detachAbort(entry);
      entry.payload.reject(
        createAdmissionRejectError("ADMISSION_LANE_EVICTED", "connection lane evicted")
      );
      this.rejectedCount += 1;
    }
    this.virtualLanes.delete(tenantKey);
  }
  oldestLaneKey() {
    let oldest;
    let oldestMs = Infinity;
    for (const [key, lane] of this.virtualLanes) {
      if (lane.lastUsedMs <= oldestMs) {
        oldestMs = lane.lastUsedMs;
        oldest = key;
      }
    }
    return oldest;
  }
  evictIdleLanes() {
    const now = this.clock.now();
    const keysToDelete = [];
    for (const [key, lane] of this.virtualLanes) {
      if (now - lane.lastUsedMs >= ADMISSION_LANE_TTL_MS) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.deleteLane(key);
    }
    if (this.virtualLanes.size > 0) {
      this.armLaneEviction();
    } else {
      this.clearLaneEviction();
    }
  }
  armLaneEviction() {
    this.clearLaneEviction();
    this.laneEvictionTimer = this.clock.setTimer(
      () => this.evictIdleLanes(),
      ADMISSION_LANE_TTL_MS
    );
  }
  clearLaneEviction() {
    if (this.laneEvictionTimer !== void 0) {
      this.clock.clearTimer(this.laneEvictionTimer);
      this.laneEvictionTimer = void 0;
    }
  }
  laneTotalQueuedCost() {
    let total = 0;
    for (const [, lane] of this.virtualLanes) {
      total = addSaturated(total, lane.queue.totalCost);
    }
    return total;
  }
  laneTotalQueuedCount() {
    let count = 0;
    for (const [, lane] of this.virtualLanes) {
      count = addSaturated(count, lane.queue.size);
    }
    return count;
  }
  laneTenantSnapshot() {
    const arr = [];
    for (const [tenantKey, lane] of this.virtualLanes) {
      arr.push({
        tenantKey,
        queuedCount: saturateSnapshotNumber(lane.queue.size),
        queuedCost: saturateSnapshotNumber(lane.queue.totalCost)
      });
    }
    return arr;
  }
  releaseVirtual(record) {
    if (record.virtualDisposition === "active") {
      this.virtualActiveCost -= record.cost;
      this.virtualActiveCount -= 1;
    } else if (record.virtualDisposition === "queued") {
      this.virtualQueue.removeById(record.id);
    }
    record.virtualDisposition = "none";
    this.dispatchVirtual();
  }
  dispatchVirtual() {
    while (this.virtualQueue.size > 0) {
      const available = this.adaptation.currentLimit - this.virtualActiveCost;
      if (available <= 0) return;
      const entry = this.virtualQueue.dequeue(available);
      if (!entry) return;
      const record = this.active.get(entry.payload.recordId);
      if (!record || record.released) continue;
      record.virtualDisposition = "active";
      this.virtualActiveCost = addSaturated(this.virtualActiveCost, record.cost);
      this.virtualActiveCount = addSaturated(this.virtualActiveCount, 1);
    }
  }
  rebuildVirtualState(enable) {
    this.virtualQueue = new FairCostQueue(this.config.maxQueueCount, this.config.maxQueueCost);
    this.virtualActiveCost = 0;
    this.virtualActiveCount = 0;
    for (const record of this.active.values()) record.virtualDisposition = "none";
    if (!enable) return;
    for (const record of this.active.values()) {
      if (record.cost > this.adaptation.currentLimit) {
        record.virtualDisposition = "rejected";
        continue;
      }
      if (record.cost <= this.adaptation.currentLimit - this.virtualActiveCost) {
        record.virtualDisposition = "active";
        this.virtualActiveCost = addSaturated(this.virtualActiveCost, record.cost);
        this.virtualActiveCount = addSaturated(this.virtualActiveCount, 1);
      } else if (this.virtualQueue.enqueue({
        id: record.id,
        tenantKey: "_existing",
        cost: record.cost,
        enqueuedAtMs: record.admittedAtMs,
        deadlineMs: Number.MAX_SAFE_INTEGER,
        payload: { recordId: record.id }
      })) {
        record.virtualDisposition = "queued";
      } else {
        record.virtualDisposition = "rejected";
      }
    }
  }
  reject(code, message) {
    this.rejectedCount += 1;
    return { status: "rejected", code, message };
  }
  clearEntryTimer(entry) {
    if (entry.timerId !== void 0) {
      this.clock.clearTimer(entry.timerId);
      entry.timerId = void 0;
    }
  }
  detachAbort(entry) {
    if (entry.payload.signal && entry.payload.onAbort) {
      entry.payload.signal.removeEventListener("abort", entry.payload.onAbort);
      entry.payload.onAbort = void 0;
    }
  }
  sampleIntegral() {
    const now = this.clock.now();
    const dt = now - this.lastSampleMs;
    if (dt > 0) {
      const limit = this.adaptation.currentLimit;
      const activeForIntegral = this.activeCost >= BigInt(limit) ? limit : Number(this.activeCost);
      sampleActiveIntegral(this.adaptation, activeForIntegral, dt);
      this.lastSampleMs = now;
    }
  }
  armWindowTimer() {
    if (this.windowTimer !== void 0) {
      this.clock.clearTimer(this.windowTimer);
      this.windowTimer = void 0;
    }
    if (this.shutDown || this.config.mode === "off") return;
    const tick = () => {
      this.tick();
      if (!this.shutDown && this.config.mode !== "off") {
        this.windowTimer = this.clock.setTimer(tick, this.config.windowMs);
      }
    };
    this.windowTimer = this.clock.setTimer(tick, this.config.windowMs);
  }
}
export {
  AdaptiveAdmissionController
};
