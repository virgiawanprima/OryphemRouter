/**
 * ADR-002 step 4 — the auto sub-strategy must actually REACH the engine.
 *
 * `rankWithAutoCombo` already accepted a strategy and forwarded it to
 * `selectAutoCombo({ opts: { strategy } })`, but `handleComboChat` called it with two
 * arguments, so the third was always undefined and the engine used its "rules" default.
 * A UI selector for the sub-strategy would have looked functional while silently
 * ignoring the choice — this test is the guard that keeps the plumbing honest.
 *
 * The adapter is mocked so the assertion is about what the dispatcher SENDS, not about
 * what the engine decides.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { selectAutoCombo } = vi.hoisted(() => ({ selectAutoCombo: vi.fn() }));

vi.mock("open-sse/services/comboAdapter.js", () => ({
  selectAutoCombo,
  setAutoComboEnabled: vi.fn(),
  isAutoComboEnabled: () => true,
}));

import { handleComboChat } from "open-sse/services/combo.js";

const MODELS = ["openai/gpt-5.6-luna", "anthropic/claude-sonnet-5"];
const LOG = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

async function run(extra) {
  return handleComboChat({
    body: { messages: [{ role: "user", content: "hi" }] },
    models: MODELS,
    handleSingleModel: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    log: LOG,
    comboName: "c1",
    comboStrategy: "auto",
    ...extra,
  });
}

describe("auto sub-strategy forwarding", () => {
  beforeEach(() => {
    selectAutoCombo.mockReset();
    selectAutoCombo.mockResolvedValue(null); // no reorder needed; we assert the call args
  });

  it("forwards the combo's autoRoutingStrategy to the engine", async () => {
    await run({ autoRoutingStrategy: "lkgp" });
    expect(selectAutoCombo).toHaveBeenCalledTimes(1);
    expect(selectAutoCombo.mock.calls[0][0].opts.strategy).toBe("lkgp");
  });

  it("forwards every sub-strategy unchanged", async () => {
    for (const strategy of ["cost", "eco", "latency", "fast", "sla-aware", "sla"]) {
      selectAutoCombo.mockClear();
      await run({ autoRoutingStrategy: strategy });
      expect(selectAutoCombo.mock.calls[0][0].opts.strategy, strategy).toBe(strategy);
    }
  });

  it("leaves the engine default in place when no sub-strategy is configured", async () => {
    await run({});
    // undefined means "not specified" → selectWithStrategy falls back to its own default.
    expect(selectAutoCombo.mock.calls[0][0].opts.strategy).toBeUndefined();
  });

  it("does not consult the engine for non-auto strategies", async () => {
    await run({ comboStrategy: "fallback", autoRoutingStrategy: "lkgp" });
    expect(selectAutoCombo).not.toHaveBeenCalled();
  });
});
