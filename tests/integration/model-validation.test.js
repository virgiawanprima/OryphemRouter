/**
 * Integration tests: canonical model registry validation.
 *
 * The goal of this suite is to verify which model IDs are recognized as
 * "real" (canonical) versus fake/abbreviated, so the router does not forward
 * garbage model IDs upstream.
 *
 * NOTE ON MODULE LOCATION:
 *   The spec mentions `src/lib/auth/modelAuthenticity.js` (isModelInCanonicalRegistry).
 *   That module does NOT exist in the current codebase (checked). The canonical
 *   registry actually lives in `open-sse/providers/registry/*` and is exposed via
 *   `open-sse/providers/index.js` (PROVIDER_MODELS) + `open-sse/config/providerModels.js`
 *   (isValidModel). We therefore test the REAL registry directly, and keep a
 *   skipped placeholder for the not-yet-created module.
 *
 * Offline: pure registry logic, no network.
 */

import { describe, it, expect, vi } from "vitest";
import REGISTRY from "open-sse/providers/registry/index.js";
import { PROVIDER_MODELS } from "open-sse/providers/index.js";
import { isValidModel } from "open-sse/config/providerModels.js";

// Canonical provider ids = registry ids only (aliases like "oc"/"kr" are NOT canonical).
const CANONICAL_PROVIDER_IDS = new Set(REGISTRY.map((r) => r.id));

/**
 * Minimal stand-in for the (not yet existing) `isModelInCanonicalRegistry`.
 * Mirrors the anti-fraud intent: an id is canonical only when BOTH the provider
 * segment is a canonical registry id AND the model is in that provider's catalog.
 */
function isModelInCanonicalRegistry(providerOrAlias, modelId) {
  if (!CANONICAL_PROVIDER_IDS.has(providerOrAlias)) return false;
  return isValidModel(providerOrAlias, modelId);
}

describe("canonical model registry (open-sse/providers/registry)", () => {
  it("recognizes real model IDs", () => {
    expect(isModelInCanonicalRegistry("openai", "gpt-4o")).toBe(true);
    expect(isModelInCanonicalRegistry("anthropic", "claude-3-5-sonnet-20241022")).toBe(true);
    expect(isModelInCanonicalRegistry("gemini", "gemini-2.0-flash")).toBe(true);
  });

  it("rejects fake / non-existent model IDs", () => {
    expect(isModelInCanonicalRegistry("openai", "gpt-4o-fake")).toBe(false);
    expect(isModelInCanonicalRegistry("anthropic", "claude-3-7-nonsense")).toBe(false);
    // "default" is a reserved-ish word, not a real OpenAI model
    expect(isModelInCanonicalRegistry("openai", "default")).toBe(false);
  });

  it("rejects unknown providers entirely (provider segment must be canonical)", () => {
    expect(isModelInCanonicalRegistry("does-not-exist", "gpt-4o")).toBe(false);
    expect(isModelInCanonicalRegistry("", "gpt-4o")).toBe(false);
    expect(isModelInCanonicalRegistry(undefined, "gpt-4o")).toBe(false);
  });

  it("does NOT treat abbreviation IDs as canonical (oc/xxx, kr/xxx)", () => {
    // "oc" and "kr" are aliases (→ opencode / kiro), never canonical provider ids.
    expect(CANONICAL_PROVIDER_IDS.has("oc")).toBe(false);
    expect(CANONICAL_PROVIDER_IDS.has("kr")).toBe(false);

    // The canonical model map is keyed by canonical ids only.
    expect(Object.prototype.hasOwnProperty.call(PROVIDER_MODELS, "oc")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(PROVIDER_MODELS, "kr")).toBe(false);

    // So an abbreviated "oc/<model>" string is NOT canonical — even if "gpt-4o"
    // itself is a real model under the resolved provider (opencode passthrough).
    expect(isModelInCanonicalRegistry("oc", "gpt-4o")).toBe(false);
    expect(isModelInCanonicalRegistry("kr", "claude-sonnet-4.5")).toBe(false);
  });

  it("registry resolves abbreviations to canonical ids at the ALIAS layer (not registry)", () => {
    // Sanity: the alias → canonical mapping exists, so abbreviation support is a
    // routing-layer concern, not a registry-integrity concern.
    const opencode = REGISTRY.find((r) => r.id === "opencode");
    const kiro = REGISTRY.find((r) => r.id === "kiro");
    expect(opencode?.alias).toBe("oc");
    expect(kiro?.alias).toBe("kr");
  });
});

describe.skip("modelAuthenticity.js (not yet created)", () => {
  // TODO(modelAuthenticity): src/lib/auth/modelAuthenticity.js does not exist in the
  // current codebase. When it lands with `isModelInCanonicalRegistry`, replace the
  // local helper above with the real import and un-skip these tests:
  //
  //   import { isModelInCanonicalRegistry } from "../src/lib/auth/modelAuthenticity.js";
  //
  // The helper in this file mirrors its intended contract 1:1 so the assertions
  // here document the expected behavior.
  it("exports isModelInCanonicalRegistry", () => {
    // placeholder — module does not exist yet
    expect(true).toBe(true);
  });
});
