/**
 * X Search request contract.
 *
 * x-search is the one provider whose baseUrl is a RESPONSES endpoint
 * (https://api.x.ai/v1/responses) rather than a chat one. That pairing is load-bearing:
 * xAI exposes X Search as a server-side tool on the Responses API, so the body must use
 * Responses vocabulary (`input` + `tools: [{type: "x_search"}]`) and NOT `messages`.
 *
 * Every other provider in the registry points at a chat endpoint, which makes this one look
 * misconfigured — so a well-meaning "fix" of the baseUrl would send a Responses body to a chat
 * endpoint and fail silently. This test states the contract out loud.
 */

import { describe, expect, it } from "vitest";
import { buildXSearchRequest, extractXSearchHits, DEFAULT_X_SEARCH_MODEL } from "../../open-sse/handlers/search/xSearch.js";

describe("X Search request shape", () => {
  it("sends a Responses-API body to the responses endpoint (not messages/chat)", () => {
    const { url, init } = buildXSearchRequest(
      { baseUrl: "https://api.x.ai/v1/responses" },
      { query: "climate policy", token: "tok-123" }
    );
    expect(url).toBe("https://api.x.ai/v1/responses");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: DEFAULT_X_SEARCH_MODEL,
      stream: false,
      input: "climate policy",
      tools: [{ type: "x_search" }],
    });
    // Responses vocabulary, not chat vocabulary.
    expect(body.messages).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer tok-123");
  });

  it("maps timeRange and domainFilter onto the x_search tool options", () => {
    const { init } = buildXSearchRequest(
      { baseUrl: "https://api.x.ai/v1/responses" },
      { query: "q", timeRange: "week", domainFilter: ["@jack", "-blocked"] }
    );
    const tool = JSON.parse(init.body).tools[0];
    expect(tool.type).toBe("x_search");
    expect(tool.from_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Negations are dropped; handles are normalised and capped at 20.
    expect(tool.allowed_x_handles).toEqual(["jack"]);
  });

  it("falls back to the built-in responses URL when the provider config has none", () => {
    const { url } = buildXSearchRequest({}, { query: "q" });
    expect(url).toBe("https://api.x.ai/v1/responses");
  });
});

describe("X Search result extraction", () => {
  it("keeps ONLY X/Twitter URLs when the payload has any, labelled by handle", () => {
    const hits = extractXSearchHits(
      { citations: ["https://example.com/other", "https://x.com/jack/status/12345"], output_text: "snippet text" },
      "query",
      5
    );
    // The non-X citation is dropped by design: this is X Search.
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://x.com/jack/status/12345");
    expect(hits[0].title).toBe("@jack");
    expect(hits[0].author).toBe("jack");
    expect(hits[0].snippet).toBe("snippet text");
  });

  it("always yields something — falls back to the query when the payload has no text", () => {
    const hits = extractXSearchHits({ output: [] }, "fallback query", 3);
    expect(hits).toEqual([]);
    const withUrl = extractXSearchHits({ output: [{ url: "https://x.com/a/status/9" }] }, "fallback query", 3);
    expect(withUrl[0].snippet).toBe("fallback query");
  });
});
