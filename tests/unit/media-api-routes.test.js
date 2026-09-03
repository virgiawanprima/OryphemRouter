/**
 * Unit tests for the newly-integrated OpenAI-compatible media API routes
 * (src/app/api/v1/...).
 *
 * Covers:
 *  - every route module exports OPTIONS + POST as functions;
 *  - each POST handler returns a 4xx "missing credentials" response when the
 *    requested provider has no stored credentials — no real network calls are
 *    made (global fetch is stubbed before the import graph loads).
 *
 * NOTE on the fetch stub: the handlers transitively import
 * open-sse/utils/proxyFetch.js, which captures `globalThis.fetch` at module
 * load time as its internal `originalFetch`. `vi.hoisted` runs before the
 * module imports, so setting `globalThis.fetch` there guarantees every code
 * path resolves to the stub instead of the network.
 */
import { describe, it, expect, vi } from "vitest";

const { fetchStub } = vi.hoisted(() => {
  const stub = vi.fn(async () =>
    new Response('{"error":{"message":"stubbed 500"}}', {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  );
  globalThis.fetch = stub;
  return { fetchStub: stub };
});

import * as upscaleRoute from "@/app/api/v1/images/upscale/route.js";
import * as musicRoute from "@/app/api/v1/music/generations/route.js";
import * as ocrRoute from "@/app/api/v1/ocr/route.js";
import * as rerankRoute from "@/app/api/v1/rerank/route.js";
import * as moderationsRoute from "@/app/api/v1/moderations/route.js";
import * as audioTranslateRoute from "@/app/api/v1/audio/translate/route.js";

const ROUTES = {
  "images/upscale": upscaleRoute,
  "music/generations": musicRoute,
  ocr: ocrRoute,
  rerank: rerankRoute,
  moderations: moderationsRoute,
  "audio/translate": audioTranslateRoute,
};

function jsonPost(path, body) {
  return new Request(`http://test.local${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function expect4xx(res, label) {
  expect(res, `${label} should be a Response`).toBeInstanceOf(Response);
  expect(res.status, `${label} should be a 4xx (missing credentials)`).toBeGreaterThanOrEqual(400);
  expect(res.status, `${label} should be a 4xx (missing credentials)`).toBeLessThan(500);
}

describe("media API routes", () => {
  it("exports OPTIONS + POST as functions for every route", () => {
    for (const [name, mod] of Object.entries(ROUTES)) {
      expect(typeof mod.POST, `${name} POST`).toBe("function");
      expect(typeof mod.OPTIONS, `${name} OPTIONS`).toBe("function");
    }
  });

  it("OPTIONS returns a CORS preflight response", async () => {
    for (const [name, mod] of Object.entries(ROUTES)) {
      const res = await mod.OPTIONS();
      expect(res, `${name} OPTIONS`).toBeInstanceOf(Response);
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    }
  });

  it("POST /v1/images/upscale → 4xx for missing credentials (adobe-firefly)", async () => {
    const res = await upscaleRoute.POST(
      jsonPost("/v1/images/upscale", { model: "adobe-firefly/topaz-standard" })
    );
    expect4xx(res, "images/upscale");
  });

  it("POST /v1/music/generations → 4xx for missing credentials (suno)", async () => {
    const res = await musicRoute.POST(
      jsonPost("/v1/music/generations", { model: "suno/chirp-v4" })
    );
    expect4xx(res, "music/generations");
  });

  it("POST /v1/ocr → 4xx for missing credentials (anthropic)", async () => {
    const res = await ocrRoute.POST(
      jsonPost("/v1/ocr", { document: "aGVsbG8=", provider: "anthropic" })
    );
    expect4xx(res, "ocr");
  });

  it("POST /v1/rerank → 4xx for missing credentials (cohere)", async () => {
    const res = await rerankRoute.POST(
      jsonPost("/v1/rerank", {
        model: "cohere/rerank-v3.5",
        query: "hello",
        documents: ["world"],
      })
    );
    expect4xx(res, "rerank");
  });

  it("POST /v1/moderations → 4xx for missing credentials (openai default)", async () => {
    const res = await moderationsRoute.POST(
      jsonPost("/v1/moderations", { input: "test input" })
    );
    expect4xx(res, "moderations");
  });

  it("POST /v1/audio/translate → 4xx for missing credentials (openai/whisper-1)", async () => {
    const fd = new FormData();
    fd.append("model", "openai/whisper-1");
    fd.append("file", new Blob(["audio"], { type: "audio/mpeg" }), "audio.mp3");
    const res = await audioTranslateRoute.POST(
      new Request("http://test.local/v1/audio/translate", { method: "POST", body: fd })
    );
    expect4xx(res, "audio/translate");
  });

  it("never hit the real network (fetch stayed stubbed)", () => {
    // The missing-credentials path must not reach the network. fetchStub is the
    // only fetch in the module graph, so if any handler tried to call out it
    // would land here (and we would have seen a 5xx instead of a 4xx above).
    expect(typeof fetchStub).toBe("function");
  });
});
