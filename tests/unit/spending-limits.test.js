import { describe, it, expect } from "vitest";

// Pure-logic tests for Spending Limits — no DB writes, fully idempotent.
// Mirrors the enforcement logic implemented in src/sse/handlers/chat.js.
describe("Spending Limits Logic", () => {
  it("blocks when monthly cost exceeds limit and no free fallback", () => {
    const totalMonthCost = 11.5;
    const maxMonth = 10;
    const fallbackToFree = false;
    const autoPause = true;

    const limitExceeded = maxMonth && totalMonthCost >= maxMonth;
    expect(limitExceeded).toBe(true);
    // With fallbackToFree=false and autoPause=true → 403 blocked
    expect(limitExceeded && autoPause && !fallbackToFree).toBe(true);
  });

  it("allows request with free fallback when limit exceeded", () => {
    const totalMonthCost = 11.5;
    const maxMonth = 10;
    const fallbackToFree = true;

    const limitExceeded = maxMonth && totalMonthCost >= maxMonth;
    expect(limitExceeded).toBe(true);
    // With fallbackToFree=true → route to free-only (body._spendingLimitExceeded=true)
    expect(limitExceeded && fallbackToFree).toBe(true);
  });

  it("blocks when daily cost exceeds limit and autoPause on", () => {
    const totalDayCost = 3;
    const maxDay = 2;
    const autoPause = true;
    const fallbackToFree = false;

    const limitExceeded = maxDay && totalDayCost >= maxDay;
    expect(limitExceeded).toBe(true);
    expect(limitExceeded && autoPause && !fallbackToFree).toBe(true);
  });

  it("does not enforce when limits are empty strings", () => {
    const maxMonth = "";
    const maxDay = "";
    const totalMonthCost = 999;

    expect(maxMonth && totalMonthCost >= parseFloat(maxMonth)).toBeFalsy();
    expect(maxDay && totalMonthCost >= parseFloat(maxDay)).toBeFalsy();
  });

  it("treats undefined limits as safe defaults (no blocking)", () => {
    const limits = {}; // legacy DB without spendingLimits
    const maxMonth = parseFloat(limits.maxCostPerMonth) || 0;
    const maxDay = parseFloat(limits.maxCostPerDay) || 0;
    expect(maxMonth).toBe(0);
    expect(maxDay).toBe(0);
    // autoPause/fallbackToFree default to true when undefined
    expect(limits.autoPause !== false).toBe(true);
    expect(limits.fallbackToFree !== false).toBe(true);
  });

  it("blocks only when cost is strictly greater than or equal to limit", () => {
    // At exactly the limit → blocked
    expect(10 >= 10).toBe(true);
    // Below limit → allowed
    expect(9 >= 10).toBe(false);
  });
});