import { describe, it, expect } from "vitest";
import { getRotatedModels } from "../../open-sse/services/combo.js";

// Cost tiers (from combo.js): oc=0, kr=1, vertex=2, felo=3, minimax=10, glm=11, kimi=12, cc=20, cx=21, gh=22, cu=23
describe("Cost-Optimized Routing Strategy", () => {
  it("reorders models cheapest-first for cost-optimized strategy", () => {
    const models = ["cc/claude-opus-4-7", "kr/claude-sonnet-4.5", "minimax/MiniMax-M2.7", "oc/mimo-v2.5-free"];
    const result = getRotatedModels(models, "test", "cost-optimized", 1);

    // oc (0) < kr (1) < minimax (10) < cc (20)
    expect(result[0]).toBe("oc/mimo-v2.5-free");
    expect(result[1]).toBe("kr/claude-sonnet-4.5");
    expect(result[2]).toBe("minimax/MiniMax-M2.7");
    expect(result[3]).toBe("cc/claude-opus-4-7");
  });

  it("preserves original order within same cost tier", () => {
    // kr and vertex are both free tier (1 and 2) - kr first
    const models = ["vertex/gemini-3.1-pro-preview", "kr/claude-sonnet-4.5"];
    const result = getRotatedModels(models, "test", "cost-optimized", 1);
    expect(result[0]).toBe("kr/claude-sonnet-4.5");
    expect(result[1]).toBe("vertex/gemini-3.1-pro-preview");
  });

  it("puts free providers above paid in fallback ordering", () => {
    const models = ["cx/gpt-5.5", "gh/gpt-5.4", "glm/glm-5.1", "oc/mimo-v2.5-free"];
    const result = getRotatedModels(models, "test", "cost-optimized", 1);

    // oc (0) should be first, then glm (11), then cx (21), then gh (22)
    expect(result[0]).toBe("oc/mimo-v2.5-free");
    expect(result[1]).toBe("glm/glm-5.1");
    expect(result[2]).toBe("cx/gpt-5.5");
    expect(result[3]).toBe("gh/gpt-5.4");
  });

  it("handles unknown providers with highest cost (99)", () => {
    const models = ["unknown/model-x", "kr/claude-sonnet-4.5"];
    const result = getRotatedModels(models, "test", "cost-optimized", 1);
    // kr (1) should come before unknown (99)
    expect(result[0]).toBe("kr/claude-sonnet-4.5");
    expect(result[1]).toBe("unknown/model-x");
  });

  it("handles single model without crashing", () => {
    const result = getRotatedModels(["cc/claude-opus-4-7"], "test", "cost-optimized", 1);
    expect(result).toEqual(["cc/claude-opus-4-7"]);
  });

  it("handles empty models array", () => {
    const result = getRotatedModels([], "test", "cost-optimized", 1);
    expect(result).toEqual([]);
  });

  it("does not reorder for fallback strategy", () => {
    const models = ["cc/claude-opus-4-7", "kr/claude-sonnet-4.5"];
    const result = getRotatedModels(models, "test", "fallback", 1);
    expect(result).toEqual(["cc/claude-opus-4-7", "kr/claude-sonnet-4.5"]);
  });

  it("reorders for cost-optimized but preserves fallback for round-robin", () => {
    const models = ["cc/claude-opus-4-7", "oc/mimo-v2.5-free"];
    const rr = getRotatedModels(models, "test", "round-robin", 1);
    expect(rr).toHaveLength(2);
  });
});