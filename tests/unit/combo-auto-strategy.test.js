import { describe, it, expect, vi, afterEach } from "vitest";
import { getRotatedModels, handleComboChat } from "open-sse/services/combo.js";
import { setAutoComboEnabled } from "open-sse/services/comboAdapter.js";

const ORIGINAL_ENV = process.env.ORYPHEM_AUTOCOMBO_ENABLED;

afterEach(() => {
  setAutoComboEnabled(false);
  if (ORIGINAL_ENV === undefined) delete process.env.ORYPHEM_AUTOCOMBO_ENABLED;
  else process.env.ORYPHEM_AUTOCOMBO_ENABLED = ORIGINAL_ENV;
});

describe("combo.js — auto strategy (ported autoCombo engine)", () => {
  it("getRotatedModels keeps original order for 'auto'", () => {
    const models = ["openai/gpt-4o", "anthropic/claude-sonnet-4-6"];
    expect(getRotatedModels(models, "c1", "auto", 1)).toEqual(models);
  });

  it("handleComboChat with 'auto' + engine disabled → tries in original order", async () => {
    setAutoComboEnabled(false);
    const order = [];
    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["openai/gpt-4o", "anthropic/claude-sonnet-4-6"],
      handleSingleModel: async (_b, m) => {
        order.push(m);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
      comboName: "c1",
      comboStrategy: "auto",
    });
    expect(res.ok).toBe(true);
    // First model tried is the original first (no reorder when disabled).
    expect(order[0]).toBe("openai/gpt-4o");
  });

  it("handleComboChat with 'auto' + engine enabled → engine pick tried first", async () => {
    setAutoComboEnabled(true);
    const order = [];
    // Capture the engine's decision from its log line so the assertion is about the
    // ROUTING CONTRACT (the pick is tried first) instead of engine scoring internals.
    // The previous assertion here was `expect(order).toContain(order[0])` — true for any
    // non-empty array, i.e. it could never fail.
    const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["openai/gpt-4o", "anthropic/claude-sonnet-4-6", "google/gemini-3.5-flash"],
      handleSingleModel: async (_b, m) => {
        order.push(m);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      log,
      comboName: "c1",
      comboStrategy: "auto",
    });
    expect(res.ok).toBe(true);
    expect(order.length).toBeGreaterThanOrEqual(1);

    const rankingCall = log.info.mock.calls.find(([tag]) => tag === "AUTO-COMBO");
    if (rankingCall) {
      const picked = String(rankingCall[1]).match(/picked (\S+) first/)?.[1];
      expect(picked, "log line should name the picked model").toBeTruthy();
      expect(order[0]).toBe(picked);
    } else {
      // Safe degradation path: the engine declined to rank (opt-in inputs unavailable), so
      // the original order must be preserved — never a silent reshuffle.
      expect(order[0]).toBe("openai/gpt-4o");
    }
  });
});
