import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("loginLimiter", () => {
  let checkLock, recordFail, recordSuccess;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Fresh module state per test (the limiter keeps an in-memory Map)
    vi.resetModules();
    vi.doMock("@/lib/auth/trustedPeer.js", () => ({
      hasTrustedPeerHeaders: () => false,
    }));
    const mod = await import("@/lib/auth/loginLimiter.js");
    checkLock = mod.checkLock;
    recordFail = mod.recordFail;
    recordSuccess = mod.recordSuccess;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checkLock returns locked:false for an unknown IP", () => {
    expect(checkLock("1.2.3.4")).toEqual({ locked: false });
  });

  it("does not lock before the 5th failure", () => {
    for (let i = 0; i < 4; i++) {
      recordFail("1.2.3.4");
    }
    expect(checkLock("1.2.3.4").locked).toBe(false);
  });

  it("locks on the 5th failure with retryAfter ≈ 30s", () => {
    for (let i = 0; i < 5; i++) {
      recordFail("1.2.3.4");
    }
    const result = checkLock("1.2.3.4");
    expect(result.locked).toBe(true);
    expect(result.retryAfter).toBe(30);
  });

  it("recordSuccess clears the failure counter", () => {
    recordFail("1.2.3.4");
    recordFail("1.2.3.4");
    recordSuccess("1.2.3.4");
    // After reset, 5 fresh fails should be needed again
    for (let i = 0; i < 4; i++) recordFail("1.2.3.4");
    expect(checkLock("1.2.3.4").locked).toBe(false);
  });

  it("escalates lock duration on repeated lockouts", () => {
    // First lockout: 30s
    for (let i = 0; i < 5; i++) recordFail("1.2.3.4");
    expect(checkLock("1.2.3.4").retryAfter).toBe(30);

    // Advance past the lock, then fail again → second lockout = 120s
    vi.advanceTimersByTime(31_000);
    expect(checkLock("1.2.3.4").locked).toBe(false);
    for (let i = 0; i < 5; i++) recordFail("1.2.3.4");
    expect(checkLock("1.2.3.4").retryAfter).toBe(120);
  });

  it("auto-resets the fail window after 1h of inactivity", () => {
    recordFail("1.2.3.4");
    recordFail("1.2.3.4");
    // Advance past the 1h window
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    // Entry should be gone; checkLock returns unlocked
    expect(checkLock("1.2.3.4").locked).toBe(false);
  });

  it("getClientIp falls back to 'unknown' when no trusted headers", async () => {
    const { getClientIp } = await import("@/lib/auth/loginLimiter.js");
    const req = { headers: { get: () => null } };
    expect(getClientIp(req)).toBe("unknown");
  });
});
