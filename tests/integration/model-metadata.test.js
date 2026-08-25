/**
 * Integration tests: model metadata / capabilities (context windows).
 *
 * Two real metadata layers are covered:
 *   1. open-sse/providers/models/getMetadata.js  → getModelMetadata(providerId, modelId)
 *      (enriched MODEL_METADATA table, falls back to raw registry entry, null when unknown)
 *   2. open-sse/providers/capabilities.js        → getCapabilitiesForModel(provider, model)
 *      (runtime capabilities with contextWindow)
 *
 * Offline: pure lookups over static tables, no network.
 */

import { describe, it, expect } from "vitest";
import { getModelMetadata } from "open-sse/providers/models/getMetadata.js";
import { MODEL_METADATA } from "open-sse/providers/models/index.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { getModelInfo } from "open-sse/config/models.js";

describe("getModelMetadata (open-sse/providers/models/getMetadata.js)", () => {
  it("resolves gpt-4o context window to 128000", () => {
    const meta = getModelMetadata("openai", "gpt-4o");
    expect(meta).not.toBeNull();
    expect(meta.contextWindow).toBe(128000);
    expect(meta.name).toBe("GPT-4o");
  });

  it("resolves claude-3-5-sonnet-20241022 context window to 200000", () => {
    const meta = getModelMetadata("anthropic", "claude-3-5-sonnet-20241022");
    expect(meta).not.toBeNull();
    expect(meta.contextWindow).toBe(200000);
    expect(meta.name).toBe("Claude 3.5 Sonnet");
  });

  it("resolves gemini-2.0-flash context window to 1048576", () => {
    const meta = getModelMetadata("gemini", "gemini-2.0-flash");
    expect(meta).not.toBeNull();
    expect(meta.contextWindow).toBe(1048576);
  });

  it("returns null for an unknown model (spec contract)", () => {
    expect(getModelMetadata("openai", "totally-unknown-model-xyz")).toBeNull();
    expect(getModelMetadata("openai", "default")).toBeNull();
  });

  it("falls back to the raw registry entry for known-but-unenriched models", () => {
    // gpt-5.4 is in the openai registry but not in MODEL_METADATA → registry fallback.
    const meta = getModelMetadata("openai", "gpt-5.4");
    expect(meta).toEqual({ id: "gpt-5.4", name: "GPT-5.4" });
  });

  it("returns null when the model is in neither MODEL_METADATA nor the registry", () => {
    expect(getModelMetadata("fakeprovider", "nope-nope-nope")).toBeNull();
  });

  it("MODEL_METADATA contains the three canonical verification models", () => {
    expect(MODEL_METADATA["gpt-4o"]?.contextWindow).toBe(128000);
    expect(MODEL_METADATA["claude-3-5-sonnet-20241022"]?.contextWindow).toBe(200000);
    expect(MODEL_METADATA["gemini-2.0-flash"]?.contextWindow).toBe(1048576);
  });
});

describe("getCapabilitiesForModel — context window resolution", () => {
  it("resolves gpt-4o context window to 128000", () => {
    const caps = getCapabilitiesForModel("openai", "gpt-4o");
    expect(caps.contextWindow).toBe(128000);
  });

  it("resolves claude-3-5-sonnet-20241022 context window to 200000", () => {
    const caps = getCapabilitiesForModel("anthropic", "claude-3-5-sonnet-20241022");
    expect(caps.contextWindow).toBe(200000);
  });

  it("resolves claude-3-5-sonnet (short id) to 200000 via the claude-3 pattern", () => {
    const caps = getCapabilitiesForModel("anthropic", "claude-3-5-sonnet");
    expect(caps.contextWindow).toBe(200000);
  });

  it("returns a fully-formed capabilities object for known models", () => {
    const caps = getCapabilitiesForModel("openai", "gpt-4o");
    expect(caps).toEqual(expect.objectContaining({
      contextWindow: 128000,
      maxOutput: 16384,
      vision: true,
      tools: true,
    }));
  });

  it("returns a safe default (never null) for unknown models — codebase contract", () => {
    // NOTE: capabilities intentionally return a merged DEFAULT_CAPABILITIES object
    // (contextWindow 200000) for unknown models rather than null, so consumers
    // never null-check. This documents the actual contract (differs from
    // getModelMetadata, which DOES return null for unknowns).
    const caps = getCapabilitiesForModel("openai", "totally-unknown-model-xyz");
    expect(caps).not.toBeNull();
    expect(caps.contextWindow).toBe(200000);
    expect(typeof caps.maxOutput).toBe("number");
  });

  it("is stable and deterministic for the same input", () => {
    const a = getCapabilitiesForModel("openai", "gpt-4o");
    const b = getCapabilitiesForModel("openai", "gpt-4o");
    expect(a).toEqual(b);
  });
});

describe("config/models.js getModelInfo — model metadata registry", () => {
  it("returns a metadata object with a contextWindow for any model id", () => {
    // MODEL_INFO is currently empty; every id falls back to DEFAULT_MODEL_INFO
    // (contextWindow 200000). Unknown ids never return null.
    const info = getModelInfo("gpt-4o");
    expect(info).toBeTruthy();
    expect(typeof info.contextWindow).toBe("number");
    expect(Array.isArray(info.type)).toBe(true);
  });

  it("returns the same default shape for unknown models (documented contract)", () => {
    const info = getModelInfo("does-not-exist");
    expect(info.contextWindow).toBe(200000);
  });
});
