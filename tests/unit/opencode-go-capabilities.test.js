/**
 * Regression guard for the 9Router capability lesson.
 *
 * Background (Projek/oryphemrouter): 9Router resolved model capabilities from NAME
 * GLOBS. A vendor-aliased id it could not spell out — `deepseek-flash` (a
 * vision-capable model) — matched the generic `*deepseek*` rule, was flagged
 * text-only, and the vision adapter then rerouted every image request away from it.
 *
 * OryphemRouter's defense is tier 1 of `getCapabilitiesForModel`: an explicit
 * PROVIDER_CAPABILITIES table. These tests assert that the table actually COVERS the
 * shipped catalog — a miss silently falls back to the same glob guess as 9Router.
 *
 * Offline: pure static data assertions, no network.
 */

import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels.js";
import { isVisionModelId } from "../../open-sse/utils/visionModels.js";

const PROVIDER = "opencode-go";
const REGISTRY_MODELS = (PROVIDER_MODELS[PROVIDER] || []).map((m) => m.id);

// Ids the upstream catalog lists but the registry does not ship. Declared
// explicitly so that adding one as a custom/passthrough model cannot inherit a
// glob guess. `deepseek-flash` is the id 9Router got wrong.
const UPSTREAM_ONLY_DECLARED = ["deepseek-flash", "deepseek-v4.1-flash"];

// `visionModels.js` is a SECOND, independent vision heuristic (name fragments) used
// by compression/lite.js and autoCombo. It disagrees with the capability table for
// these ids (the table says vision:true, the fragment list has no matching entry).
// Pinned here so the divergence is visible and a NEW one has to be a deliberate edit
// — consolidating the two sources is tracked as an open item.
const VISION_HEURISTIC_GAPS = ["mimo-v2.5", "mimo-v2.5-pro", "qwen3.7-plus", "qwen3.6-plus"];

describe("OpenCode Go capabilities — explicit declaration, never a glob guess", () => {
  it("has a non-empty fixture (guards against a silently empty assertion set)", () => {
    expect(REGISTRY_MODELS.length).toBeGreaterThan(10);
  });

  it("declares an explicit provider entry for EVERY shipped model", () => {
    const undeclared = REGISTRY_MODELS.filter(
      (id) => getCapabilitiesForModel(PROVIDER, id).capabilitySource !== "provider"
    );
    // A failure here means a newly shipped model would be resolved by a name glob —
    // add it to PROVIDER_CAPABILITIES["opencode-go"] instead of relying on a pattern.
    expect(undeclared).toEqual([]);
  });

  it("declares the upstream-only ids we have evidence for", () => {
    for (const id of UPSTREAM_ONLY_DECLARED) {
      expect(getCapabilitiesForModel(PROVIDER, id).capabilitySource).toBe("provider");
    }
  });

  it("resolves the short alias exactly like the canonical provider id", () => {
    // combo.js / capacityAdapter.js derive the provider from the raw "ocg/model"
    // prefix; if the alias missed tier 1 the entry would be bypassed entirely.
    for (const id of [...REGISTRY_MODELS, ...UPSTREAM_ONLY_DECLARED]) {
      expect(getCapabilitiesForModel("ocg", id)).toEqual(getCapabilitiesForModel(PROVIDER, id));
    }
  });

  it("keeps deepseek-flash vision-capable (probe evidence, not a name guess)", () => {
    const caps = getCapabilitiesForModel(PROVIDER, "deepseek-flash");
    expect(caps.capabilitySource).toBe("provider");
    expect(caps.vision).toBe(true);
    // Measured, not taken from metadata (the upstream listing reports no limits and
    // 9Router advertised 128000).
    expect(caps.contextWindow).toBe(1048576);
  });

  it("pins the deliberate text-only decisions the globs got wrong", () => {
    // These ids match generic patterns that WOULD have given a different answer;
    // the explicit entry is what makes the decision intentional.
    expect(getCapabilitiesForModel(PROVIDER, "glm-5.2").vision).toBe(false);
    expect(getCapabilitiesForModel(PROVIDER, "qwen3.7-max").vision).toBe(false);
    expect(getCapabilitiesForModel(PROVIDER, "deepseek-v4-flash").vision).toBe(false);
    expect(getCapabilitiesForModel(PROVIDER, "kimi-k2.7-code").vision).toBe(true);
  });

  it("documents the upstream ids that still fall through to a guess (known gap)", () => {
    // Not a bug to hide: an upstream id we have not probed and did not declare is
    // still resolved by a name glob ("pattern") or by the bare floor ("default").
    // Pinned so the residual risk stays quantified — each one needs the image probe
    // before it can be declared for real.
    expect(getCapabilitiesForModel(PROVIDER, "glm-5.3").capabilitySource).toBe("pattern");
    expect(getCapabilitiesForModel(PROVIDER, "qwen3.8-max").capabilitySource).toBe("pattern");
    expect(getCapabilitiesForModel(PROVIDER, "longcat-2.0").capabilitySource).toBe("default");
  });

  it("keeps the second vision heuristic's known disagreements pinned", () => {
    const diverging = REGISTRY_MODELS.filter(
      (id) => getCapabilitiesForModel(PROVIDER, id).vision === true && !isVisionModelId(id)
    );
    expect(diverging.sort()).toEqual([...VISION_HEURISTIC_GAPS].sort());
  });
});
