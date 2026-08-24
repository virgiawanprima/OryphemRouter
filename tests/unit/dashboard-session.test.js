import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(),
}));

vi.mock("@/lib/dataDir", () => ({
  DATA_DIR: "/tmp/oryphemrouter-test-data",
}));

import {
  createDashboardAuthToken,
  verifyDashboardAuthToken,
  getDashboardAuthSession,
  shouldUseSecureCookie,
  verifyDashboardPassword,
} from "@/lib/auth/dashboardSession.js";
import { getSettings } from "@/lib/localDb";

describe("dashboardSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default settings carry passwordVersion 0 (missing key also defaults to 0).
    getSettings.mockResolvedValue({ passwordVersion: 0 });
  });

  it("createDashboardAuthToken → verifyDashboardAuthToken returns true", async () => {
    const token = await createDashboardAuthToken({ userId: "u1" });
    expect(typeof token).toBe("string");
    expect(await verifyDashboardAuthToken(token)).toBe(true);
  });

  it("verifyDashboardAuthToken returns false for garbage token", async () => {
    expect(await verifyDashboardAuthToken("garbage.token.here")).toBe(false);
    expect(await verifyDashboardAuthToken("")).toBe(false);
    expect(await verifyDashboardAuthToken(null)).toBe(false);
  });

  it("getDashboardAuthSession returns claims payload", async () => {
    const token = await createDashboardAuthToken({ role: "admin" });
    const payload = await getDashboardAuthSession(token);
    expect(payload.authenticated).toBe(true);
    expect(payload.role).toBe("admin");
  });

  it("getDashboardAuthSession returns null for invalid token", async () => {
    expect(await getDashboardAuthSession("bad")).toBeNull();
    expect(await getDashboardAuthSession(null)).toBeNull();
  });

  it("rejects a token minted before a password change (pwv bump)", async () => {
    const token = await createDashboardAuthToken({ userId: "u1" });
    // Password was changed → passwordVersion advanced to 1.
    getSettings.mockResolvedValue({ passwordVersion: 1 });
    expect(await verifyDashboardAuthToken(token)).toBe(false);
    expect(await getDashboardAuthSession(token)).toBeNull();
  });

  it("accepts a token minted after the password change (same pwv)", async () => {
    getSettings.mockResolvedValue({ passwordVersion: 1 });
    const token = await createDashboardAuthToken({ userId: "u1" });
    expect(await verifyDashboardAuthToken(token)).toBe(true);
    expect((await getDashboardAuthSession(token)).userId).toBe("u1");
  });

  it("treats a missing pwv on legacy tokens as version 0", async () => {
    // Simulate a pre-upgrade token: sign without pwv, verify against version 0.
    const { SignJWT } = await import("jose");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const secretFile = path.join("/tmp/oryphemrouter-test-data", "jwt-secret");
    const secret = fs.readFileSync(secretFile, "utf8").trim();
    const legacy = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(secret));
    getSettings.mockResolvedValue({ passwordVersion: 0 });
    expect(await verifyDashboardAuthToken(legacy)).toBe(true);
    // Once a password change bumps the version, the legacy token dies.
    getSettings.mockResolvedValue({ passwordVersion: 1 });
    expect(await verifyDashboardAuthToken(legacy)).toBe(false);
  });

  it("shouldUseSecureCookie forces Secure when AUTH_COOKIE_SECURE=true (operator opt-in)", () => {
    const original = process.env.AUTH_COOKIE_SECURE;
    process.env.AUTH_COOKIE_SECURE = "true";
    const req = { headers: { get: () => null } };
    // AUTH_COOKIE_SECURE is an explicit operator opt-in (e.g. HTTPS tunnel that
    // does not stamp x-forwarded-proto); it must force the Secure flag.
    expect(shouldUseSecureCookie(req)).toBe(true);
    if (original === undefined) delete process.env.AUTH_COOKIE_SECURE;
    else process.env.AUTH_COOKIE_SECURE = original;
  });

  it("shouldUseSecureCookie is true for https forwarded-proto", () => {
    const req = { headers: { get: (h) => h === "x-forwarded-proto" ? "https" : null } };
    expect(shouldUseSecureCookie(req)).toBe(true);
  });

  it("shouldUseSecureCookie is false for plain http without force", () => {
    const original = process.env.AUTH_COOKIE_SECURE;
    delete process.env.AUTH_COOKIE_SECURE;
    const req = { headers: { get: (h) => h === "x-forwarded-proto" ? "http" : null } };
    expect(shouldUseSecureCookie(req)).toBe(false);
    if (original !== undefined) process.env.AUTH_COOKIE_SECURE = original;
  });

  describe("verifyDashboardPassword", () => {
    it("returns false for empty or non-string password", async () => {
      expect(await verifyDashboardPassword("")).toBe(false);
      expect(await verifyDashboardPassword(null)).toBe(false);
      expect(await verifyDashboardPassword(undefined)).toBe(false);
    });

    it("compares against stored bcrypt hash", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("secret123", 10);
      getSettings.mockResolvedValue({ password: hash });
      expect(await verifyDashboardPassword("secret123")).toBe(true);
      expect(await verifyDashboardPassword("wrong")).toBe(false);
    });

    it("falls back to INITIAL_PASSWORD env when no hash stored", async () => {
      const original = process.env.INITIAL_PASSWORD;
      process.env.INITIAL_PASSWORD = "custom-init";
      getSettings.mockResolvedValue({});
      expect(await verifyDashboardPassword("custom-init")).toBe(true);
      expect(await verifyDashboardPassword("123")).toBe(false);
      if (original === undefined) delete process.env.INITIAL_PASSWORD;
      else process.env.INITIAL_PASSWORD = original;
    });

    it("falls back to default '123' when no hash and no env", async () => {
      const original = process.env.INITIAL_PASSWORD;
      delete process.env.INITIAL_PASSWORD;
      getSettings.mockResolvedValue({});
      expect(await verifyDashboardPassword("123")).toBe(true);
      if (original !== undefined) process.env.INITIAL_PASSWORD = original;
    });
  });
});
