import { describe, it, expect } from "vitest";
import { computeComboContextLength, memberContextWindow } from "open-sse/services/comboContext.js";

describe("comboContext — effective context-length for a combo", () => {
  it("uses explicit context_length override", () => {
    expect(computeComboContextLength({ context_length: 100000, models: ["openai/gpt-4o"] })).toBe(100000);
  });

  it("returns the minimum of member model context windows", () => {
    // openai/gpt-4o (128k) vs deepseek/deepseek-v4-pro (128000) — take the smaller.
    const len = computeComboContextLength({ models: ["openai/gpt-4o", "deepseek/deepseek-v4-pro"] });
    expect(len).toBeGreaterThan(0);
  });

  it("returns undefined when no member has a known window", () => {
    expect(computeComboContextLength({ models: ["unknown-provider/unknown-model-xyz"] })).toBeUndefined();
  });

  it("returns undefined when combo is empty/null", () => {
    expect(computeComboContextLength(null)).toBeUndefined();
    expect(computeComboContextLength({ models: [] })).toBeUndefined();
  });

  it("memberContextWindow handles strings and object steps", () => {
    expect(memberContextWindow("openai/gpt-4o")).toBe(128000);
    expect(memberContextWindow({ model: "gpt-4o", provider: "openai" })).toBe(128000);
    expect(memberContextWindow("nope/definitely-not-a-model")).toBeUndefined();
    expect(memberContextWindow(null)).toBeUndefined();
  });
});
