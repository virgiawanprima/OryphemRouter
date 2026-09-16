/**
 * ADR-002 — combo strategy exposure.
 *
 * The selector (dashboard), the API validator (/api/settings) and the combo dispatcher
 * must all read ONE list, and every value on that list must actually do something.
 * These tests pin both halves: the boundary rejects what the engine cannot honour, and
 * each exposed value has a behaviour assertion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  COMBO_STRATEGIES,
  COMBO_STRATEGY_VALUES,
  ROUTING_STRATEGY_VALUES,
  AUTO_ROUTING_STRATEGIES,
  AUTO_ROUTING_STRATEGY_VALUES,
  normalizeComboStrategy,
  normalizeAutoRoutingStrategy,
  validateComboStrategySettings,
} from "../../open-sse/utils/omni/routingStrategies.js";
import { getRotatedModels, resetComboRotation } from "../../open-sse/services/combo.js";

describe("combo strategy — single source of truth", () => {
  it("lists each strategy once, with a label and a description", () => {
    const values = COMBO_STRATEGIES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
    for (const s of COMBO_STRATEGIES) {
      expect(s.label, s.value).toBeTruthy();
      expect(s.description, s.value).toBeTruthy();
    }
  });

  it("keeps the auto sub-strategy descriptors in step with the value list", () => {
    // The UI reads the descriptors, the validator and the MCP schema read the value list —
    // a descriptor added without a value (or vice versa) would offer an unvalidatable choice.
    expect(AUTO_ROUTING_STRATEGIES.map((s) => s.value)).toEqual(AUTO_ROUTING_STRATEGY_VALUES);
    for (const s of AUTO_ROUTING_STRATEGIES) {
      expect(s.label, s.value).toBeTruthy();
      expect(normalizeAutoRoutingStrategy(s.value), s.value).toBe(s.value);
    }
  });

  it("exposes the default plus every value the combo dispatcher handles", () => {
    expect(COMBO_STRATEGY_VALUES).toEqual([
      "fallback", "round-robin", "cost-optimized", "auto", "fusion", "pipeline",
    ]);
  });

  it("stays a subset of the ported reference names, plus the local default", () => {
    for (const v of COMBO_STRATEGY_VALUES) {
      if (v === "fallback") continue; // local default; the ported list has no "fallback"
      expect(ROUTING_STRATEGY_VALUES, v).toContain(v);
    }
  });

  it("normalises case/whitespace and rejects names that are not selectable", () => {
    expect(normalizeComboStrategy("  ROUND-ROBIN ")).toBe("round-robin");
    // Ported reference names that the COMBO dispatcher does not implement must not be
    // selectable — offering them would be a no-op the operator cannot detect.
    expect(normalizeComboStrategy("priority")).toBeNull();
    expect(normalizeComboStrategy("fill-first")).toBeNull();
    expect(normalizeComboStrategy("p2c")).toBeNull();
    expect(normalizeComboStrategy("")).toBeNull();
    expect(normalizeComboStrategy(undefined)).toBeNull();
  });
});

describe("combo strategy behaviour — every selectable value", () => {
  beforeEach(() => {
    resetComboRotation();
  });

  // tiers come from PROVIDER_COST_TIERS in open-sse/services/combo.js:
  // oc = 0, minimax = 10, anthropic = 20
  const models = ["anthropic/claude-x", "oc/free-y", "minimax/m2-z"];

  it("fallback keeps the declared order", () => {
    expect(getRotatedModels(models, "c", "fallback")).toEqual(models);
  });

  it("round-robin rotates the starting model and wraps around", () => {
    expect(getRotatedModels(models, "c", "round-robin")[0]).toBe("anthropic/claude-x");
    expect(getRotatedModels(models, "c", "round-robin")[0]).toBe("oc/free-y");
    expect(getRotatedModels(models, "c", "round-robin")[0]).toBe("minimax/m2-z");
    expect(getRotatedModels(models, "c", "round-robin")[0]).toBe("anthropic/claude-x");
  });

  it("cost-optimized reorders by provider cost tier, cheapest first", () => {
    expect(getRotatedModels(models, "c", "cost-optimized")).toEqual([
      "oc/free-y", "minimax/m2-z", "anthropic/claude-x",
    ]);
  });

  it("cost-optimized is stable within the same tier", () => {
    const sameTier = ["claude/a", "anthropic/b"];
    expect(getRotatedModels(sameTier, "c", "cost-optimized")).toEqual(sameTier);
  });

  it("auto leaves ordering to the async engine (identity in the rotator)", () => {
    expect(getRotatedModels(models, "c", "auto")).toEqual(models);
  });

  it("fusion and pipeline do not reorder (branched in the chat handler)", () => {
    // Both branch inside src/sse/handlers/chat.js *before* rotation is consulted, so the
    // rotator must stay a no-op for them instead of shuffling unexpectedly.
    expect(getRotatedModels(models, "c", "fusion")).toEqual(models);
    expect(getRotatedModels(models, "c", "pipeline")).toEqual(models);
  });
});

describe("combo strategy validation at the API boundary", () => {
  it("accepts a valid global default and normalises it", () => {
    expect(validateComboStrategySettings({ comboStrategy: "Round-Robin" }))
      .toEqual({ ok: true, comboStrategy: "round-robin" });
  });

  it("treats empty/null as 'use the default'", () => {
    expect(validateComboStrategySettings({ comboStrategy: "" })).toEqual({ ok: true });
    expect(validateComboStrategySettings({ comboStrategy: null })).toEqual({ ok: true });
  });

  it("rejects an unknown global default and names the valid values", () => {
    const res = validateComboStrategySettings({ comboStrategy: "p2c" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid comboStrategy 'p2c'");
    expect(res.error).toContain("fallback, round-robin, cost-optimized, auto, fusion, pipeline");
  });

  it("accepts a valid per-combo strategy alongside its sibling fields", () => {
    const res = validateComboStrategySettings({
      comboStrategies: { mycombo: { fallbackStrategy: "fusion", judgeModel: "openai/gpt-5.6-sol" } },
    });
    expect(res).toEqual({ ok: true });
  });

  it("rejects an unknown per-combo strategy and names the offending combo", () => {
    const res = validateComboStrategySettings({
      comboStrategies: { mycombo: { fallbackStrategy: "headroom" } },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid fallbackStrategy 'headroom'");
    expect(res.error).toContain("mycombo");
  });

  it("leaves payloads that do not touch strategies alone", () => {
    expect(validateComboStrategySettings({ spendingLimits: { maxCostPerDay: 5 } })).toEqual({ ok: true });
    expect(validateComboStrategySettings({})).toEqual({ ok: true });
    expect(validateComboStrategySettings(null)).toEqual({ ok: true });
  });

  it("accepts a valid auto sub-strategy on a combo", () => {
    const res = validateComboStrategySettings({
      comboStrategies: { mycombo: { fallbackStrategy: "auto", autoRoutingStrategy: "lkgp" } },
    });
    expect(res).toEqual({ ok: true });
  });

  it("rejects an unknown auto sub-strategy and names the combo", () => {
    const res = validateComboStrategySettings({
      comboStrategies: { mycombo: { fallbackStrategy: "auto", autoRoutingStrategy: "weighted" } },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Invalid autoRoutingStrategy 'weighted'");
    expect(res.error).toContain("mycombo");
    // The sub-strategy list is the auto engine's, not the combo list.
    expect(res.error).toContain("rules, cost, eco, latency, fast, sla-aware, sla, lkgp");
  });

  it("treats an empty auto sub-strategy as 'engine default'", () => {
    const res = validateComboStrategySettings({
      comboStrategies: { mycombo: { fallbackStrategy: "auto", autoRoutingStrategy: "" } },
    });
    expect(res).toEqual({ ok: true });
  });
});
