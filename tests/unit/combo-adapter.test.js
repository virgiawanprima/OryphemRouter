import { describe, it, expect, afterEach } from "vitest";
import { selectAutoCombo, setAutoComboEnabled, isAutoComboEnabled } from "open-sse/services/comboAdapter.js";

describe("autoCombo integration adapter (OmniRoute engine)", () => {
  afterEach(() => setAutoComboEnabled(false));

  it("disabled by default → returns null (native fallback)", async () => {
    setAutoComboEnabled(false);
    const r = await selectAutoCombo({
      provider: "auto",
      candidates: [{ provider: "openai", model: "gpt-4o" }],
    });
    expect(r).toBeNull();
  });

  it("empty candidates → null even when enabled", async () => {
    setAutoComboEnabled(true);
    expect(await selectAutoCombo({ provider: "auto", candidates: [] })).toBeNull();
  });

  it("enabled → returns a selected candidate target", async () => {
    setAutoComboEnabled(true);
    const r = await selectAutoCombo({
      provider: "auto",
      candidates: [
        { provider: "openai", model: "gpt-4o", costPer1MTokens: 10 },
        { provider: "anthropic", model: "claude-4", costPer1MTokens: 20 },
        { provider: "google", model: "gemini-3", costPer1MTokens: 5 },
      ],
      opts: { budgetCap: 0.05 },
    });
    expect(r).not.toBeNull();
    expect(["openai", "anthropic", "google"]).toContain(r.provider);
    expect(typeof r.score).toBe("number");
  });

  it("named strategy (least-used) → picks lowest-load candidate", async () => {
    setAutoComboEnabled(true);
    const r = await selectAutoCombo({
      provider: "auto",
      candidates: [
        { provider: "a", model: "m1", currentLoad: 8 },
        { provider: "b", model: "m2", currentLoad: 2 },
      ],
      opts: { strategy: "least-used" },
    });
    expect(r.provider).toBe("b");
    expect(r.strategy).toBe("least-used");
  });

  it("named strategy (headroom) → picks most quota remaining", async () => {
    setAutoComboEnabled(true);
    const r = await selectAutoCombo({
      provider: "auto",
      candidates: [
        { provider: "a", model: "m1", quotaRemaining: 50 },
        { provider: "b", model: "m2", quotaRemaining: 900 },
      ],
      opts: { strategy: "headroom" },
    });
    expect(r.provider).toBe("b");
  });

  it("isAutoComboEnabled reflects toggles", () => {
    setAutoComboEnabled(true);
    expect(isAutoComboEnabled()).toBe(true);
    setAutoComboEnabled(false);
    expect(isAutoComboEnabled()).toBe(false);
  });
});
