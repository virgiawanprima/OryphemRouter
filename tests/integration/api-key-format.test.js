/**
 * Integration tests: API key FORMAT pre-checks (no network).
 *
 * `validateApiKey` in src/lib/auth/apiKeyValidator.js runs a synchronous
 * format pre-check (preValidateKeyFormat) BEFORE any network request. Clearly
 * malformed keys are rejected immediately with errorType "invalid_format" and
 * never hit the wire. This suite pins that contract.
 *
 * All fetch calls are stubbed — no real network. Format errors short-circuit
 * before fetch, so the invalid-format tests must prove fetch was NOT called.
 *
 * NOTE ON THE SPEC'S "VALID" EXAMPLES:
 *   The current code uses strict minimum-length patterns:
 *     openai  /^sk-[A-Za-z0-9]{20,}$/      (≥20 chars after "sk-")
 *     groq    /^gsk_[A-Za-z0-9]{30,}$/     (≥30 chars after "gsk_")
 *   "sk-1234567890abcdef" (16 chars) and "gsk_abcdef" (6 chars) are therefore
 *   REJECTED by the strict built-in patterns. They are accepted as valid only
 *   by lenient providers that declare no format pattern (custom
 *   openai-compatible nodes). Both paths are covered below.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { validateApiKey, clearAllValidationCache } from "../src/lib/auth/apiKeyValidator.js";

// ── fetch stub ──────────────────────────────────────────────────────────────
// Returns a 200 "models list" response for any URL — enough for the validator
// to build a success result without touching the network.
function makeOkFetch(callsRef) {
  return vi.fn(async (url, opts) => {
    callsRef.push({ url, method: opts?.method || "GET" });
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
}

let fetchCalls = [];
let fetchMock = null;

beforeEach(() => {
  fetchCalls = [];
  fetchMock = makeOkFetch(fetchCalls);
  vi.stubGlobal("fetch", fetchMock);
  clearAllValidationCache(); // deterministic, isolated per test
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateApiKey — format pre-checks", () => {
  it("accepts a well-formed OpenAI key (format gate passes → mocked network)", async () => {
    const result = await validateApiKey("openai", "sk-AbCdEfGhIjKlMnOpQrStUvWxYz123456");
    expect(result.valid).toBe(true);
    expect(result.errorType).toBeNull();
    expect(result.modelCount).toBe(2);
    // Format gate passed → a real network call was attempted (mocked).
    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0].url).toContain("api.openai.com");
  });

  it("accepts a well-formed Groq key", async () => {
    const result = await validateApiKey("groq", "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890");
    expect(result.valid).toBe(true);
    expect(result.errorType).toBeNull();
    expect(fetchCalls.length).toBeGreaterThan(0);
  });

  it("accepts spec's short examples for lenient (pattern-less) providers", async () => {
    // Custom openai-compatible nodes declare no format pattern → any non-empty
    // key passes the format gate. This is the path where the spec's examples
    // ("sk-1234567890abcdef", "gsk_abcdef") are treated as valid format.
    const r1 = await validateApiKey("openai-compatible-mock", "sk-1234567890abcdef", {
      baseUrl: "https://mock.example.com/v1",
    });
    expect(r1.valid).toBe(true);
    expect(r1.errorType).toBeNull();

    const r2 = await validateApiKey("openai-compatible-mock", "gsk_abcdef", {
      baseUrl: "https://mock.example.com/v1",
    });
    expect(r2.valid).toBe(true);
    expect(r2.errorType).toBeNull();
  });

  it("rejects spec's short examples under strict built-in patterns (documented behavior)", async () => {
    // Current strict patterns require ≥20 chars (openai) / ≥30 chars (groq) after
    // the prefix, so the spec's short examples fail the format pre-check.
    const openai = await validateApiKey("openai", "sk-1234567890abcdef");
    expect(openai.valid).toBe(false);
    expect(openai.errorType).toBe("invalid_format");

    const groq = await validateApiKey("groq", "gsk_abcdef");
    expect(groq.valid).toBe(false);
    expect(groq.errorType).toBe("invalid_format");
  });

  it.each([
    ["abc", "too short, no prefix"],
    ["123", "digits only, no prefix"],
    ["sk-", "prefix with no payload"],
    ["sk-abc", "prefix + payload too short"],
    ["gsk_", "groq prefix with no payload"],
  ])("rejects invalid format key %j (%s)", async (key, _reason) => {
    const result = await validateApiKey("openai", key);
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("invalid_format");
  });

  it("rejects empty and whitespace-only keys", async () => {
    const empty = await validateApiKey("openai", "");
    expect(empty.valid).toBe(false);
    expect(empty.errorType).toBe("invalid_format");

    const whitespace = await validateApiKey("openai", "   ");
    expect(whitespace.valid).toBe(false);
    expect(whitespace.errorType).toBe("invalid_format");
  });

  it("rejects non-string / missing keys without any network call", async () => {
    const missing = await validateApiKey("openai", undefined);
    expect(missing.valid).toBe(false);
    expect(missing.errorType).toBe("invalid_format");

    const nonString = await validateApiKey("openai", 12345);
    expect(nonString.valid).toBe(false);
    expect(nonString.errorType).toBe("invalid_format");
  });

  it("does NOT hit the network when the format pre-check fails", async () => {
    for (const bad of ["abc", "123", "sk-", ""]) {
      await validateApiKey("openai", bad);
    }
    // Format errors short-circuit before fetch — prove it.
    expect(fetchCalls.length).toBe(0);
  });

  it("returns a stable result shape for format failures", async () => {
    const result = await validateApiKey("openai", "abc");
    expect(result).toEqual({
      valid: false,
      error: expect.any(String),
      errorType: "invalid_format",
      modelCount: null,
    });
  });
});
