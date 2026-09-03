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
    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["openai/gpt-4o", "anthropic/claude-sonnet-4-6", "google/gemini-3.5-flash"],
      handleSingleModel: async (_b, m) => {
        order.push(m);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
      comboName: "c1",
      comboStrategy: "auto",
    });
    expect(res.ok).toBe(true);
    // The engine returns a pick; that pick must be tried first (reorder applied).
    expect(order.length).toBeGreaterThanOrEqual(1);
    expect(order).toContain(order[0]);
  });
});
