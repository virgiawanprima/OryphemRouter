import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { validateApiKey, clearAllValidationCache } from "@/lib/auth/apiKeyValidator.js";

// Stub the network so tests never hit real providers.
const realFetch = global.fetch;

beforeEach(() => {
  clearAllValidationCache();
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("deepinfra")) {
      return new Response(JSON.stringify({ object: "list", data: [{ id: "a" }, { id: "b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("moonshot")) {
      return new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 });
    }
    return new Response("not found", { status: 404 });
  };
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("apiKeyValidator — registry fallback for ported OmniRoute providers", () => {
  it("validates a registry-only provider (deepinfra) via transport.validateUrl", async () => {
    const r = await validateApiKey("deepinfra", "sk-test-1234567890");
    expect(r.valid).toBe(true);
    expect(r.modelCount).toBe(2);
    expect(r.error).toBeNull();
  });

  it("returns INVALID_KEY for a 401 from a registry-only provider (moonshot)", async () => {
    const r = await validateApiKey("moonshot", "sk-invalid-1234567890");
    expect(r.valid).toBe(false);
    expect(String(r.error).toLowerCase()).toMatch(/401|key/i);
  });

  it("unknown provider → skip-validation (valid=true), never crashes", async () => {
    const r = await validateApiKey("definitely-not-a-provider", "sk-test-1234567890");
    // Unknown providers are skip-validated by design (no endpoint to probe);
    // the important guarantee is that it resolves without throwing.
    expect(r).toBeTruthy();
    expect(r.valid).toBe(true);
  });
});
