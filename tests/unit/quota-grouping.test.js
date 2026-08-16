// Guards the Quota Tracker provider grouping: one entry per provider, and
// free/no-auth providers (no saved connection) become empty groups.
import { describe, it, expect } from "vitest";
import { groupConnectionsByProvider } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("groupConnectionsByProvider", () => {
  it("groups connections by provider in first-seen order", () => {
    const groups = groupConnectionsByProvider([
      { id: "a1", provider: "openai" },
      { id: "b1", provider: "anthropic" },
      { id: "a2", provider: "openai" },
      { id: "a3", provider: "openai" },
    ]);
    expect(groups).toEqual([
      { provider: "openai", connections: [{ id: "a1", provider: "openai" }, { id: "a2", provider: "openai" }, { id: "a3", provider: "openai" }] },
      { provider: "anthropic", connections: [{ id: "b1", provider: "anthropic" }] },
    ]);
  });

  it("appends free/no-auth providers as empty groups without duplicating connected ones", () => {
    const groups = groupConnectionsByProvider(
      [{ id: "o1", provider: "opencode" }],
      ["opencode", "local-device", "searxng"],
    );
    const providers = groups.map((g) => g.provider);
    expect(providers).toEqual(["opencode", "local-device", "searxng"]);
    const opencode = groups.find((g) => g.provider === "opencode");
    expect(opencode.connections).toHaveLength(1);
    const local = groups.find((g) => g.provider === "local-device");
    expect(local.connections).toEqual([]);
  });

  it("handles empty input", () => {
    expect(groupConnectionsByProvider([])).toEqual([]);
  });
});
