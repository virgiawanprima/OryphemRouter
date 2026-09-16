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
const UPSTREAM_ONLY_DECLARED = ["deepseek-flash"];

// Registry models with NO vendor-doc statement we could find (checked 2026-09-16). They
// still resolve through a name pattern, i.e. the answer is a guess — pinned exactly so it
// cannot grow silently, and so each stays a named probe candidate.
const UNVERIFIED = [
  "glm-5.3-flash", "longcat-2.0", "qwen3.8-max", "grok-4.6", "gpt-5.6-luna",
  "hy3", "hy4-preview", "muse-spark-1.3-contributor", "muse-spark-1.2-contributor",
];

// `visionModels.js` is a SECOND, independent vision heuristic (name fragments) used
// by compression/lite.js and autoCombo. It disagrees with the capability table for
// these ids (the table says vision:true, the fragment list has no matching entry).
// Pinned here so the divergence is visible and a NEW one has to be a deliberate edit
// — consolidating the two sources is tracked as an open item.
const VISION_HEURISTIC_GAPS = [
  "mimo-v2.5", "mimo-v2.5-pro", "qwen3.6-plus", "qwen3.7-plus", "qwen3.8-flash",
  "deepseek-v4-flash", "deepseek-v4.1-flash", "kimi-k3", "grok-4.6",
];

describe("OpenCode Go capabilities — explicit declaration, never a glob guess", () => {
  it("has a non-empty fixture (guards against a silently empty assertion set)", () => {
    expect(REGISTRY_MODELS.length).toBeGreaterThan(10);
  });

  it("declares an explicit provider entry for every shipped model we can source", () => {
    const undeclared = REGISTRY_MODELS.filter(
      (id) => getCapabilitiesForModel(PROVIDER, id).capabilitySource !== "provider"
    );
    // Every registry model is either declared from a vendor doc or listed in UNVERIFIED.
    // A newly shipped model that is neither lands here instead of silently inheriting a
    // pattern guess — the failure mode that mis-flagged `deepseek-flash` in 9Router.
    expect(undeclared.sort()).toEqual([...UNVERIFIED].sort());
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

  it("keeps text-only models text-only (vendor docs)", () => {
    // Each of these matches a generic pattern that could have gone either way; the
    // explicit entry is what makes the decision intentional. Sources:
    // Z.ai "Input Modalities: Text" (glm-5.2, glm-5.1), qwen.ai/apiplatform
    // "Inputs: Text" (qwen3.7-max), MiniMax feature list with no multimodal entry
    // (m2.7, m2.5), DeepSeek "Vision: Not supported" (v4-pro).
    for (const id of ["glm-5.2", "glm-5.1", "qwen3.7-max", "minimax-m2.7", "minimax-m2.5", "deepseek-v4-pro"]) {
      expect(getCapabilitiesForModel(PROVIDER, id).vision, id).toBe(false);
    }
  });

  it("keeps vision-capable models vision-capable (vendor docs)", () => {
    // qwen.ai/apiplatform "Inputs: Text,Image,Video" (3.6-plus, 3.7-plus), MiniMax
    // "Frontier multimodal … 1M" (m3), Xiaomi "native omni-modal" (mimo-v2.5, pro),
    // Moonshot/ModelScope image+video (k2.6), DeepSeek "Vision ✓" (v4-flash, whose
    // legacy name is served by V4.1-Flash).
    for (const id of ["qwen3.6-plus", "qwen3.7-plus", "minimax-m3", "mimo-v2.5", "mimo-v2.5-pro", "kimi-k2.6", "deepseek-v4-flash"]) {
      expect(getCapabilitiesForModel(PROVIDER, id).vision, id).toBe(true);
    }
  });

  it("gives the retired DeepSeek vision name an explicit entry", () => {
    // DeepSeek docs: `deepseek-v4-flash-vision-exp` is a retired name still served by
    // DeepSeek-V4.1-Flash (Vision ✓). Left to the `*deepseek-v4*` pattern it would
    // resolve vision:false and silently drop the images it exists to accept.
    const caps = getCapabilitiesForModel(PROVIDER, "deepseek-v4-flash-vision-exp");
    expect(caps.capabilitySource).toBe("provider");
    expect(caps.vision).toBe(true);
  });

  it("uses the vendor context window for glm-5.2 (Z.ai: 1M, not the pattern's 200K)", () => {
    expect(getCapabilitiesForModel(PROVIDER, "glm-5.2").contextWindow).toBe(1000000);
    expect(getCapabilitiesForModel(PROVIDER, "glm-5.1").contextWindow).toBe(200000);
  });

  it("attributes video input where the vendor documents it", () => {
    for (const id of ["kimi-k2.6", "qwen3.6-plus", "qwen3.7-plus", "mimo-v2.5"]) {
      expect(getCapabilitiesForModel(PROVIDER, id).videoInput, id).toBe(true);
    }
  });

  it("documents the ids that still fall through to a guess (known gap)", () => {
    // Not a bug to hide: an id we could not source from vendor docs still resolves by a
    // name pattern ("pattern") or the bare floor ("default"). Pinned so the residual risk
    // stays quantified — each one needs a doc or the image probe before it is declared.
    expect(getCapabilitiesForModel(PROVIDER, "glm-5.3-flash").capabilitySource).toBe("pattern");
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
