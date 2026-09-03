/**
 * Integration tests for the adapter/bridge layer over the ported OmniRoute
 * services:
 *
 *   - open-sse/services/rateLimitAdapter.js
 *   - open-sse/services/routingAdapter.js
 *   - open-sse/services/compressionAdapter.js
 *   - open-sse/handlers/mediaRegistryBridge.js
 *   - open-sse/mcp-server/registryBridge.js (conditional)
 *
 * These adapters are deliberately defensive (graceful degradation to
 * allow/empty/fallback), so the assertions here check the public contract:
 * the expected functions exist and basic calls produce well-typed results
 * without touching the network.
 */
import { describe, it, expect } from "vitest";
import * as rateLimitAdapter from "open-sse/services/rateLimitAdapter.js";
import * as routingAdapter from "open-sse/services/routingAdapter.js";
import * as compressionAdapter from "open-sse/services/compressionAdapter.js";
import * as mediaRegistryBridge from "open-sse/handlers/mediaRegistryBridge.js";

describe("open-sse/services/rateLimitAdapter", () => {
  it("exports its public API", () => {
    expect(typeof rateLimitAdapter.withRateLimit).toBe("function");
    expect(typeof rateLimitAdapter.getRateLimitConfig).toBe("function");
    expect(typeof rateLimitAdapter.checkRateLimit).toBe("function");
  });

  it("withRateLimit runs the wrapped fn", async () => {
    const out = await rateLimitAdapter.withRateLimit(
      "test-provider",
      "test-model",
      async () => "ran"
    );
    expect(out).toBe("ran");
  });

  it("checkRateLimit returns an object carrying `allowed`", async () => {
    const result = await rateLimitAdapter.checkRateLimit("gemini", "gemini-2.0-flash");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
    expect("allowed" in result).toBe(true);
    expect(typeof result.allowed).toBe("boolean");
  });

  it("getRateLimitConfig returns a config object or null", async () => {
    const cfg = await rateLimitAdapter.getRateLimitConfig("nvidia");
    expect(cfg === null || typeof cfg === "object").toBe(true);
  });
});

describe("open-sse/services/routingAdapter", () => {
  it("exports checkAdmission / selectRoute / getRoutingConfig", () => {
    expect(typeof routingAdapter.checkAdmission).toBe("function");
    expect(typeof routingAdapter.selectRoute).toBe("function");
    expect(typeof routingAdapter.getRoutingConfig).toBe("function");
  });

  it("checkAdmission({}) returns { allowed: true } or an object with `allowed`", async () => {
    const result = await routingAdapter.checkAdmission({});
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
    expect("allowed" in result).toBe(true);
  });

  it("selectRoute returns a route object or null (never throws)", async () => {
    const route = await routingAdapter.selectRoute({
      provider: "openai",
      model: "gpt-4o",
      targets: ["gpt-4o-mini", "gpt-4o"],
    });
    expect(route === null || typeof route === "object").toBe(true);
  });

  it("getRoutingConfig returns a config object", () => {
    const cfg = routingAdapter.getRoutingConfig();
    expect(cfg === null || typeof cfg === "object").toBe(true);
  });
});

describe("open-sse/services/compressionAdapter", () => {
  it("exports estimateTokens / compressContext / getAvailableEngines", () => {
    expect(typeof compressionAdapter.estimateTokens).toBe("function");
    expect(typeof compressionAdapter.compressContext).toBe("function");
    expect(typeof compressionAdapter.getAvailableEngines).toBe("function");
  });

  it("estimateTokens('hello world') is a finite number", () => {
    const n = compressionAdapter.estimateTokens("hello world");
    expect(typeof n).toBe("number");
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it("getAvailableEngines returns an array", async () => {
    const engines = await compressionAdapter.getAvailableEngines();
    expect(Array.isArray(engines)).toBe(true);
  });

  it("compressContext returns { messages, compressed, tokensSaved }", async () => {
    const result = await compressionAdapter.compressContext({
      messages: [{ role: "user", content: "hello" }],
      model: "gpt-4o",
    });
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.compressed).toBe("boolean");
    expect(typeof result.tokensSaved).toBe("number");
  });
});

describe("open-sse/handlers/mediaRegistryBridge", () => {
  it("exports the unified media accessors", () => {
    expect(typeof mediaRegistryBridge.getMediaProvider).toBe("function");
    expect(typeof mediaRegistryBridge.listMediaProviders).toBe("function");
    expect(typeof mediaRegistryBridge.hasMediaProvider).toBe("function");
    expect(typeof mediaRegistryBridge.getMediaRegistry).toBe("function");
    expect(typeof mediaRegistryBridge.getMediaRegistryStatus).toBe("function");
  });

  it("getMediaProvider('upscale', 'adobe-firefly') returns an object or null", async () => {
    const provider = await mediaRegistryBridge.getMediaProvider("upscale", "adobe-firefly");
    expect(provider === null || typeof provider === "object").toBe(true);
  });

  it("listMediaProviders('upscale') returns an array", async () => {
    const list = await mediaRegistryBridge.listMediaProviders("upscale");
    expect(Array.isArray(list)).toBe(true);
  });

  it("getMediaRegistryStatus returns a status record for every kind", async () => {
    const status = await mediaRegistryBridge.getMediaRegistryStatus();
    expect(status).toBeTruthy();
    expect(typeof status).toBe("object");
    for (const kind of mediaRegistryBridge.MEDIA_REGISTRY_KINDS) {
      expect(["ok", "degraded", "missing"]).toContain(status[kind]);
    }
  });
});

describe("open-sse/mcp-server/registryBridge (conditional)", () => {
  it("listPortedMcpTools returns an array when the module exists", async () => {
    let mcp = null;
    try {
      mcp = await import("open-sse/mcp-server/registryBridge.js");
    } catch {
      // Module not present in this build — the conditional test is skipped.
    }
    if (!mcp || typeof mcp.listPortedMcpTools !== "function") {
      return;
    }
    const tools = await mcp.listPortedMcpTools();
    expect(Array.isArray(tools)).toBe(true);
  });
});
