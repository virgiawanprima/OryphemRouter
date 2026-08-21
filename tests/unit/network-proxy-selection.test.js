import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/models", () => ({
  getProxyPoolById: vi.fn(),
}));

import { pickProxyPoolId, resolveConnectionProxyConfig } from "@/lib/network/connectionProxy.js";
import { getProxyPoolById } from "@/models";

describe("pickProxyPoolId", () => {
  it("returns null for empty/null pool list", () => {
    expect(pickProxyPoolId([], "round-robin", "p1")).toBeNull();
    expect(pickProxyPoolId(null, "round-robin", "p1")).toBeNull();
    expect(pickProxyPoolId(undefined, "random", "p1")).toBeNull();
  });

  it("returns the single id when there is only one", () => {
    expect(pickProxyPoolId(["a"], "round-robin", "p1")).toBe("a");
    expect(pickProxyPoolId(["a"], "random", "p1")).toBe("a");
  });

  it("cycles sequentially with round-robin", () => {
    const pools = ["a", "b", "c"];
    expect(pickProxyPoolId(pools, "round-robin", "p1")).toBe("a");
    expect(pickProxyPoolId(pools, "round-robin", "p1")).toBe("b");
    expect(pickProxyPoolId(pools, "round-robin", "p1")).toBe("c");
    expect(pickProxyPoolId(pools, "round-robin", "p1")).toBe("a"); // wraps
  });

  it("keeps independent rotation state per providerId", () => {
    const pools = ["a", "b"];
    expect(pickProxyPoolId(pools, "round-robin", "x")).toBe("a");
    expect(pickProxyPoolId(pools, "round-robin", "y")).toBe("a");
    expect(pickProxyPoolId(pools, "round-robin", "x")).toBe("b");
    expect(pickProxyPoolId(pools, "round-robin", "y")).toBe("b");
  });

  it("returns a member of the list for random strategy", () => {
    const pools = ["a", "b", "c"];
    for (let i = 0; i < 10; i++) {
      expect(pools).toContain(pickProxyPoolId(pools, "random", "p1"));
    }
  });

  it("falls back to the first id for unknown strategy", () => {
    expect(pickProxyPoolId(["a", "b"], "bogus", "p1")).toBe("a");
  });
});

describe("resolveConnectionProxyConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns source:none when no proxy configured", async () => {
    const result = await resolveConnectionProxyConfig({});
    expect(result.source).toBe("none");
    expect(result.connectionProxyEnabled).toBe(false);
  });

  it("resolves an active http pool", async () => {
    getProxyPoolById.mockResolvedValue({
      id: "pool-1",
      isActive: true,
      type: "http",
      proxyUrl: "http://proxy:8080",
      noProxy: "localhost",
      strictProxy: false,
    });
    const result = await resolveConnectionProxyConfig({ proxyPoolId: "pool-1" });
    expect(result.source).toBe("pool");
    expect(result.connectionProxyEnabled).toBe(true);
    expect(result.connectionProxyUrl).toBe("http://proxy:8080");
  });

  it("falls back to legacy when pool is inactive", async () => {
    getProxyPoolById.mockResolvedValue({ id: "pool-1", isActive: false });
    const result = await resolveConnectionProxyConfig({
      proxyPoolId: "pool-1",
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://legacy:3128",
    });
    expect(result.source).toBe("legacy");
    expect(result.connectionProxyUrl).toBe("http://legacy:3128");
  });

  it("falls back to none when pool has no proxyUrl", async () => {
    getProxyPoolById.mockResolvedValue({ id: "pool-1", isActive: true, proxyUrl: "" });
    const result = await resolveConnectionProxyConfig({ proxyPoolId: "pool-1" });
    expect(result.source).toBe("none");
  });

  it("returns vercel relay payload for vercel-type pool", async () => {
    getProxyPoolById.mockResolvedValue({
      id: "pool-1",
      isActive: true,
      type: "vercel",
      proxyUrl: "https://relay.vercel.app",
      strictProxy: true,
    });
    const result = await resolveConnectionProxyConfig({ proxyPoolId: "pool-1" });
    expect(result.source).toBe("vercel");
    expect(result.vercelRelayUrl).toBe("https://relay.vercel.app");
    expect(result.strictProxy).toBe(true);
  });

  it("ignores __none__ pool id", async () => {
    const result = await resolveConnectionProxyConfig({ proxyPoolId: "__none__" });
    expect(result.source).toBe("none");
  });

  it("returns source:error when getProxyPoolById rejects", async () => {
    getProxyPoolById.mockRejectedValue(new Error("db down"));
    const result = await resolveConnectionProxyConfig({ proxyPoolId: "pool-1" });
    expect(result.source).toBe("error");
    expect(result.connectionProxyEnabled).toBe(false);
  });

  it("normalizes whitespace-only proxyUrl to empty string", async () => {
    const result = await resolveConnectionProxyConfig({
      connectionProxyEnabled: true,
      connectionProxyUrl: "   ",
    });
    expect(result.source).toBe("none");
  });
});
