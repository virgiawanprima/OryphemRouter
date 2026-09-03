import { describe, it, expect } from "vitest";
import { getModelMetadata, getModelPricing, getModelFullInfo, findRegistryModel } from "open-sse/providers/models/getMetadata.js";

describe("model metadata + pricing integration (OmniRoute enrichment)", () => {
  it("enriched model returns canonical metadata", () => {
    const m = getModelMetadata("deepseek", "deepseek-v4-pro");
    expect(m?.name).toBe("DeepSeek V4 Pro");
    expect(m?.contextWindow).toBe(128000);
    expect(m?.reasoning).toBe(true);
    expect(m?.toolCalling).toBe(true);
  });

  it("merges registry transport fields with enrichment", () => {
    // claude-web registry entry has contextLength 1000000 + metadata has name/vision
    const m = getModelMetadata("claude-web", "claude-opus-4-6");
    expect(m?.name).toBe("Claude Opus 4.6");
    expect(m?.contextWindow).toBe(1000000);
    expect(m?.vision).toBe(true);
  });

  it("falls back to raw registry entry for unknown models", () => {
    const m = getModelMetadata("deepinfra", "deepseek-ai/DeepSeek-V4-Pro");
    expect(m).not.toBeNull();
    expect(m.id).toBe("deepseek-ai/DeepSeek-V4-Pro");
  });

  it("findRegistryModel returns null for unknown", () => {
    expect(findRegistryModel("openai", "definitely-not-a-real-model-xyz")).toBeNull();
  });

  it("getModelPricing resolves canonical pricing", () => {
    const p = getModelPricing("deepseek", "deepseek-v4-pro");
    expect(p).not.toBeNull();
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
  });

  it("getModelPricing returns null when unknown", () => {
    expect(getModelPricing("openai", "definitely-not-a-real-model-xyz")).toBeNull();
  });

  it("getModelFullInfo merges metadata + pricing", () => {
    const fi = getModelFullInfo("bazaarlink", "gpt-5.5");
    expect(fi?.name).toBe("GPT-5.5");
    expect(fi?.contextWindow).toBe(1050000);
    expect(fi?.pricing).not.toBeNull();
  });
});
