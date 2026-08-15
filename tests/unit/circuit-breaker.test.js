import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies of auth.js
const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
  getSettings: vi.fn(),
  getProxyPools: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(() => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  validateApiKey: vi.fn(() => true),
  updateProviderConnection: mocks.updateProviderConnection,
  getSettings: mocks.getSettings,
  getProxyPools: mocks.getProxyPools,
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
  pickProxyPoolId: mocks.pickProxyPoolId,
}));

describe("Circuit Breaker Logic", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getProviderConnections.mockReset();
    mocks.updateProviderConnection.mockReset();
  });

  it("increments error count on consecutive failures", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { id: "conn-1", backoffLevel: 0, testStatus: "active", name: "test" },
    ]);
    mocks.updateProviderConnection.mockResolvedValue({});

    const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

    // First failure - errorCount should be 1
    await markAccountUnavailable("conn-1", 500, "server error", "test-provider", "model-1");

    expect(mocks.updateProviderConnection).toHaveBeenCalled();
    const callArgs = mocks.updateProviderConnection.mock.calls[0][1];
    expect(callArgs.circuitBreakerErrorCount).toBe(1);
    expect(callArgs.circuitBreakerLastErrorAt).toBeDefined();
  });

  it("opens circuit after 5 consecutive errors", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { id: "conn-1", backoffLevel: 0, testStatus: "active", name: "test", circuitBreakerErrorCount: 5 },
    ]);
    mocks.updateProviderConnection.mockResolvedValue({});

    const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

    const result = await markAccountUnavailable("conn-1", 500, "server error", "test-provider", "model-1");

    // After 5 errors, circuit breaker opens with 5-minute cooldown
    expect(result.shouldFallback).toBe(true);
    expect(result.cooldownMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("resets error count on successful request", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { id: "conn-1", backoffLevel: 0, testStatus: "active", name: "test", modelLock_xxx: null },
    ]);
    mocks.updateProviderConnection.mockResolvedValue({});

    const { clearAccountError } = await import("../../src/sse/services/auth.js");
    await clearAccountError("conn-1", { _connection: { id: "conn-1", testStatus: "unavailable", lastError: "x", modelLock_xxx: null } }, "model-1");

    expect(mocks.updateProviderConnection).toHaveBeenCalled();
    const callArgs = mocks.updateProviderConnection.mock.calls[0][1];
    expect(callArgs.circuitBreakerErrorCount).toBe(0);
    expect(callArgs.circuitBreakerLastErrorAt).toBeNull();
  });
});