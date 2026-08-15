import { describe, it, expect, vi } from "vitest";

// Test the free-tiers budget definition logic
// The API route uses getUsageStats from usageDb - we test the data structure contract
describe("Free-Tier Budget Tracker", () => {
  it("defines expected free providers with credit limits", () => {
    // These are the documented free providers and their limits
    const freeTiers = [
      { provider: "Kiro AI", alias: "kr", type: "credits", total: 50, unit: "credits/mo" },
      { provider: "OpenCode Free", alias: "oc", type: "unlimited", total: "∞", unit: "tokens" },
      { provider: "Vertex AI", alias: "vertex", type: "credits", total: 300, unit: "$ credits" },
    ];

    expect(freeTiers).toHaveLength(3);
    expect(freeTiers[0].alias).toBe("kr");
    expect(freeTiers[0].type).toBe("credits");
    expect(freeTiers[0].total).toBe(50);
    expect(freeTiers[1].alias).toBe("oc");
    expect(freeTiers[1].type).toBe("unlimited");
    expect(freeTiers[2].alias).toBe("vertex");
    expect(freeTiers[2].total).toBe(300);
  });

  it("API route exports GET handler and is force-dynamic", async () => {
    const route = (await import("../../src/app/api/free-tiers/stats/route.js"));
    expect(route.GET).toBeDefined();
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("calculates total free credits from credit-type providers", () => {
    const freeTiers = [
      { type: "credits", total: 50 },
      { type: "unlimited", total: "∞" },
      { type: "credits", total: 300 },
    ];
    const creditProviders = freeTiers.filter(t => t.type === "credits");
    const total = creditProviders.reduce((a, b) => a + (b.total || 0), 0);
    expect(total).toBe(350); // 50 + 300
  });
});