import { describe, it, expect, vi } from "vitest";
import { comboStepModelId, promoteModelToFront, promoteSuccessfulComboModel } from "open-sse/services/autoPromote.js";

describe("autoPromote — auto-promote successful combo model", () => {
  it("promoteModelToFront moves the winner to position #1", () => {
    const models = ["openai/gpt-4o", "anthropic/claude", "google/gemini"];
    expect(promoteModelToFront(models, "anthropic/claude")).toEqual(["anthropic/claude", "openai/gpt-4o", "google/gemini"]);
  });

  it("returns null when the winner is already first, absent, or list empty", () => {
    expect(promoteModelToFront(["a", "b"], "a")).toBeNull(); // already first
    expect(promoteModelToFront(["a", "b"], "zzz")).toBeNull(); // absent
    expect(promoteModelToFront([], "a")).toBeNull(); // empty
    expect(promoteModelToFront(["a", "b"], null)).toBeNull();
  });

  it("is pure — does not mutate the input", () => {
    const models = ["a", "b", "c"];
    promoteModelToFront(models, "b");
    expect(models).toEqual(["a", "b", "c"]);
  });

  it("comboStepModelId handles strings and object steps", () => {
    expect(comboStepModelId("openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(comboStepModelId({ model: "anthropic/claude" })).toBe("anthropic/claude");
    expect(comboStepModelId({ model: "" })).toBeNull();
    expect(comboStepModelId(null)).toBeNull();
  });

  it("promoteSuccessfulComboModel is a no-op when disabled or no combo id", async () => {
    const updateCombo = vi.fn();
    expect(await promoteSuccessfulComboModel({ id: "c1", models: ["a", "b"] }, "b", {}, { updateCombo })).toBe(false);
    expect(await promoteSuccessfulComboModel(null, "b", { comboAutoPromoteEnabled: true }, { updateCombo })).toBe(false);
    expect(updateCombo).not.toHaveBeenCalled();
  });

  it("promoteSuccessfulComboModel persists the reorder when enabled", async () => {
    const updateCombo = vi.fn(async () => true);
    const info = vi.fn();
    const ok = await promoteSuccessfulComboModel(
      { id: "c1", name: "my-combo", models: ["a", "b", "c"] },
      "c",
      { comboAutoPromoteEnabled: true },
      { updateCombo, info },
    );
    expect(ok).toBe(true);
    expect(updateCombo).toHaveBeenCalledWith("c1", { models: ["c", "a", "b"] });
    expect(info).toHaveBeenCalled();
  });

  it("swallows DB errors (best-effort) without throwing", async () => {
    const updateCombo = vi.fn(async () => { throw new Error("db down"); });
    const warn = vi.fn();
    const ok = await promoteSuccessfulComboModel(
      { id: "c1", models: ["a", "b"] },
      "b",
      { comboAutoPromoteEnabled: true },
      { updateCombo, warn },
    );
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
