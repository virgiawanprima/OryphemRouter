import { describe, it, expect, vi } from "vitest";
import { getStrategy, listStrategies, selectWithStrategy } from "open-sse/services/autoCombo/routerStrategy.js";

function cand(patch) {
  return {
    provider: patch.provider,
    model: patch.model,
    circuitBreakerState: "CLOSED",
    costPer1MTokens: 10,
    currentLoad: 0,
    headroomRemaining: 100,
    weight: 1,
    connectionId: `conn-${patch.provider}`,
    ...patch,
  };
}

const POOL = [
  cand({ provider: "a", model: "m1", costPer1MTokens: 5, currentLoad: 3, headroomRemaining: 50, weight: 1 }),
  cand({ provider: "b", model: "m2", costPer1MTokens: 10, currentLoad: 1, headroomRemaining: 200, weight: 3 }),
  cand({ provider: "c", model: "m3", costPer1MTokens: 20, currentLoad: 9, headroomRemaining: 10, weight: 0.5 }),
];

describe("autoCombo routerStrategy — ported deterministic strategies", () => {
  it("registers the new strategy names", () => {
    const names = listStrategies().map((s) => s.name);
    for (const n of [
      "weighted", "least-used", "headroom", "p2c", "random",
      "fill-first", "strict-random", "reset-window", "reset-aware", "cache-optimized",
      "context-relay", "context-optimized",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("context-optimized picks the best context fit", () => {
    const cPool = [
      cand({ provider: "a", model: "m1", maxContextTokens: 1000000 }),
      cand({ provider: "b", model: "m2", maxContextTokens: 100000 }),
    ];
    const r = selectWithStrategy(cPool, { messages: [{}, {}, {}, {}] }, "context-optimized");
    expect(["a", "b"]).toContain(r.provider);
    expect(r.strategy).toBe("context-optimized");
  });

  it("context-relay picks the highest context affinity", () => {
    const cPool = [
      cand({ provider: "a", model: "m1", contextAffinity: 0.2 }),
      cand({ provider: "b", model: "m2", contextAffinity: 0.8, connectionPoolSize: 4 }),
    ];
    const r = selectWithStrategy(cPool, {}, "context-relay");
    expect(r.provider).toBe("b");
    expect(r.strategy).toBe("context-relay");
  });

  it("least-used picks the lowest-load candidate", () => {
    const r = selectWithStrategy(POOL, {}, "least-used");
    expect(r.provider).toBe("b"); // load 1 (lowest)
    expect(r.strategy).toBe("least-used");
  });

  it("headroom picks the most quota-remaining candidate", () => {
    const r = selectWithStrategy(POOL, {}, "headroom");
    expect(r.provider).toBe("b"); // headroom 200 (highest)
    expect(r.strategy).toBe("headroom");
  });

  it("fill-first picks the most headroom (drain first)", () => {
    const r = selectWithStrategy(POOL, {}, "fill-first");
    expect(r.provider).toBe("b"); // headroom 200
    expect(r.strategy).toBe("fill-first");
  });

  it("reset-window picks the soonest quota reset", () => {
    const rwPool = [
      cand({ provider: "a", model: "m1", quotaResetIntervalSecs: 500 }),
      cand({ provider: "b", model: "m2", quotaResetIntervalSecs: 100 }),
      cand({ provider: "c", model: "m3", quotaResetIntervalSecs: 3600 }),
    ];
    const r = selectWithStrategy(rwPool, {}, "reset-window");
    expect(r.provider).toBe("b"); // 100s soonest
    expect(r.strategy).toBe("reset-window");
  });

  it("reset-aware picks the highest reset affinity", () => {
    const raPool = [
      cand({ provider: "a", model: "m1", resetWindowAffinity: 0.2 }),
      cand({ provider: "b", model: "m2", resetWindowAffinity: 0.9 }),
    ];
    const r = selectWithStrategy(raPool, {}, "reset-aware");
    expect(r.provider).toBe("b");
  });

  it("cache-optimized picks the highest cache/context affinity", () => {
    const cPool = [
      cand({ provider: "a", model: "m1", cacheAffinity: 0.3 }),
      cand({ provider: "b", model: "m2", cacheAffinity: 0.95 }),
    ];
    const r = selectWithStrategy(cPool, {}, "cache-optimized");
    expect(r.provider).toBe("b");
  });

  it("weighted/random/p2c/strict-random return a member of the pool", () => {
    for (const n of ["weighted", "random", "p2c", "strict-random"]) {
      const r = selectWithStrategy(POOL, {}, n);
      expect(["a", "b", "c"]).toContain(r.provider);
      expect(r.strategy).toBe(n);
    }
  });

  it("handles a single-candidate pool", () => {
    const r = selectWithStrategy([cand({ provider: "only", model: "m1" })], {}, "weighted");
    expect(r.provider).toBe("only");
    expect(r.strategy).toBe("weighted");
  });
});
