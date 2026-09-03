const MAX_UNFITTABLE_SKIPS = 2;
class FairCostQueue {
  constructor(maxCount, maxCost) {
    this.maxCount = maxCount;
    this.maxCost = maxCost;
  }
  buckets = /* @__PURE__ */ new Map();
  order = [];
  cursor = 0;
  count = 0;
  cost = 0;
  get size() {
    return this.count;
  }
  get totalCost() {
    return this.cost;
  }
  snapshot() {
    return { count: this.count, cost: this.cost };
  }
  canAccept(entryCost) {
    if (!Number.isSafeInteger(entryCost) || entryCost <= 0) return false;
    if (this.count >= this.maxCount) return false;
    if (entryCost > this.maxCost - this.cost) return false;
    return true;
  }
  enqueue(entry) {
    if (!this.canAccept(entry.cost)) return false;
    let bucket = this.buckets.get(entry.tenantKey);
    if (!bucket) {
      bucket = [];
      this.buckets.set(entry.tenantKey, bucket);
      this.order.push(entry.tenantKey);
    }
    bucket.push(entry);
    this.count += 1;
    this.cost += entry.cost;
    return true;
  }
  /**
   * Round-robin dequeue, optionally skipping tenant heads that do not fit available cost.
   * After MAX_UNFITTABLE_SKIPS actual pass-overs, an unfittable head reserves capacity:
   * smaller work is not admitted ahead of it until it fits, is removed, or capacity rises.
   */
  dequeue(maxCost = Number.MAX_SAFE_INTEGER) {
    if (this.count === 0) return void 0;
    const n = this.order.length;
    let reserved;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const tenant = this.order[idx];
      const entry = this.buckets.get(tenant)?.[0];
      if (!entry) continue;
      if ((entry.skipCount ?? 0) >= MAX_UNFITTABLE_SKIPS) {
        if (!reserved || entry.enqueuedAtMs < reserved.entry.enqueuedAtMs) {
          reserved = { idx, entry };
        }
      }
    }
    if (reserved) {
      if (reserved.entry.cost > maxCost) return void 0;
      return this.takeAt(reserved.idx);
    }
    const bypassed = [];
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const tenant = this.order[idx];
      const bucket = this.buckets.get(tenant);
      const entry = bucket?.[0];
      if (!entry) continue;
      if (entry.cost > maxCost) {
        bypassed.push(entry);
        continue;
      }
      for (const skipped of bypassed) {
        skipped.skipCount = (skipped.skipCount ?? 0) + 1;
      }
      return this.takeAt(idx);
    }
    return void 0;
  }
  takeAt(idx) {
    const tenant = this.order[idx];
    const bucket = this.buckets.get(tenant);
    const entry = bucket?.[0];
    if (!entry) return void 0;
    bucket.shift();
    this.count -= 1;
    this.cost -= entry.cost;
    entry.skipCount = 0;
    if (bucket.length === 0) {
      this.buckets.delete(tenant);
      this.order.splice(idx, 1);
      this.cursor = this.order.length === 0 ? 0 : idx % this.order.length;
    } else {
      this.cursor = (idx + 1) % this.order.length;
    }
    return entry;
  }
  /** Peek next without removing (for oversized-vs-limit checks). */
  peek() {
    if (this.count === 0) return void 0;
    const n = this.order.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const tenant = this.order[idx];
      const bucket = this.buckets.get(tenant);
      if (bucket && bucket.length > 0) return bucket[0];
    }
    return void 0;
  }
  removeById(id) {
    for (let ti = 0; ti < this.order.length; ti++) {
      const tenant = this.order[ti];
      const bucket = this.buckets.get(tenant);
      if (!bucket) continue;
      const idx = bucket.findIndex((e) => e.id === id);
      if (idx < 0) continue;
      const [entry] = bucket.splice(idx, 1);
      this.count -= 1;
      this.cost -= entry.cost;
      if (bucket.length === 0) {
        this.buckets.delete(tenant);
        this.order.splice(ti, 1);
        if (this.order.length === 0) {
          this.cursor = 0;
        } else if (ti < this.cursor) {
          this.cursor -= 1;
        } else if (this.cursor >= this.order.length) {
          this.cursor = 0;
        }
      }
      return entry;
    }
    return void 0;
  }
  drain() {
    const out = [];
    while (true) {
      const e = this.dequeue();
      if (!e) break;
      out.push(e);
    }
    this.cursor = 0;
    return out;
  }
}
export {
  FairCostQueue
};
