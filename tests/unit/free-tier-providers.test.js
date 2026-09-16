/**
 * `hasFree` on a registry entry is hand-maintained; the free-tier catalogs are the
 * evidence. These tests pin the derived set that keeps the two from drifting apart.
 */

import { describe, it, expect } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { FREE_MODEL_BUDGETS } from "../../open-sse/config/freeModelCatalog.js";
import { FREE_TIER_BUDGETS, FREE_TIER_PROVIDER_IDS, isFreeTierProvider } from "../../open-sse/config/freeTierCatalog.js";

describe("derived free-tier provider set", () => {
  it("covers every provider documented in either free catalog", () => {
    for (const id of Object.keys(FREE_TIER_BUDGETS)) {
      expect(isFreeTierProvider(id), `budget provider ${id}`).toBe(true);
    }
    const modelProviders = new Set(FREE_MODEL_BUDGETS.map((m) => m.provider).filter(Boolean));
    for (const id of modelProviders) {
      expect(isFreeTierProvider(id), `model-budget provider ${id}`).toBe(true);
    }
  });

  it("documents far more free providers than the hand-maintained flags", () => {
    const handFlagged = REGISTRY.filter((r) => r.hasFree === true).length;
    // This is the drift the derivation exists to fix: the static flag covered a fraction.
    expect(handFlagged).toBeGreaterThan(0);
    expect(FREE_TIER_PROVIDER_IDS.size).toBeGreaterThanOrEqual(79);
    expect(FREE_TIER_PROVIDER_IDS.size).toBeGreaterThan(handFlagged * 3);
  });

  it("uses canonical registry ids, so consumers can compare against entry.id", () => {
    // A catalog row written with a short alias would silently drop out of the set —
    // this is the ratchet that makes such a mistake fail loudly instead.
    const registryIds = new Set(REGISTRY.map((r) => r.id));
    const aliases = new Map();
    for (const r of REGISTRY) {
      for (const a of [r.alias, ...(r.aliases || [])]) if (a) aliases.set(a, r.id);
    }
    const offenders = [...FREE_TIER_PROVIDER_IDS].filter((p) => !registryIds.has(p));
    expect(offenders.map((p) => (aliases.has(p) ? `${p} (alias of ${aliases.get(p)})` : `${p} (unknown)`))).toEqual([]);
  });

  it("does not mark providers without a documented free tier as free", () => {
    for (const id of ["anthropic", "openai"]) {
      expect(isFreeTierProvider(id), id).toBe(false);
    }
  });

  it("exposes the documented free set as plain data", () => {
    expect(FREE_TIER_PROVIDER_IDS).toBeInstanceOf(Set);
    for (const id of ["mistral", "groq", "openrouter", "cerebras", "sambanova", "together"]) {
      expect(isFreeTierProvider(id), id).toBe(true);
    }
  });
});
