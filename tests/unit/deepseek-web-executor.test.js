import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The real PoW solver needs a genuinely valid challenge; mock it for unit tests.
vi.mock("open-sse/lib/deepseek-pow.js", () => ({
  solveDeepSeekPowAsync: vi.fn(async () => 42),
}));

import { DeepSeekWebExecutor } from "open-sse/executors/deepseek-web.js";

// Mock fetch to simulate the DeepSeek web API flow.
function sseBody(events) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of events) controller.enqueue(encoder.encode(ev + "\n"));
      controller.close();
    },
  });
  return stream;
}

function okJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DeepSeek Web executor (ported from OmniRoute)", () => {
  const executor = new DeepSeekWebExecutor();
  let calls = [];

  beforeEach(() => {
    calls = [];
    global.fetch = vi.fn(async (url, init) => {
      calls.push({ url: String(url), init });
      const u = String(url);
      if (u.includes("/v0/users/current")) {
        return okJson({ code: 0, data: { biz_data: { token: "access-token-abc" } } });
      }
      if (u.includes("/v0/chat_session/create")) {
        return okJson({ code: 0, data: { biz_data: { chat_session: { id: "sess-1" } } } });
      }
      if (u.includes("/v0/chat_session/delete")) {
        return okJson({ code: 0 });
      }
      if (u.includes("/v0/chat/create_pow_challenge")) {
        return okJson({
          code: 0,
          data: {
            biz_data: {
              challenge: {
                algorithm: "DeepSeekHashV1",
                challenge: "abc",
                salt: "salt",
                signature: "sig",
                difficulty: 10,
                expire_at: Date.now() + 60000,
                expire_after: 60000,
                target_path: "/api/v0/chat/completion",
              },
            },
          },
        });
      }
      if (u.includes("/v0/chat/completion")) {
        return new Response(
          sseBody([
            `data: ${JSON.stringify({ p: "response/status", v: "STARTED" })}`,
            `data: ${JSON.stringify({
              p: "response/fragments",
              v: [{ type: "ANSWER", content: "Hello from " }, { type: "ANSWER", content: "DeepSeek!" }],
            })}`,
            `data: ${JSON.stringify({ p: "response/status", v: "FINISHED" })}`,
            `data: ${JSON.stringify({ p: "response/status", v: "DONE" })}`,
          ]),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
      return okJson({ code: 0 });
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("non-stream: returns OpenAI-compatible JSON with content", async () => {
    const result = await executor.execute({
      model: "deepseek-chat",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: false,
      credentials: { apiKey: "user-token-123" },
    });
    expect(result.response.status).toBe(200);
    const json = await result.response.json();
    expect(json.choices[0].message.content).toContain("Hello from DeepSeek");
    expect(json.choices[0].finish_reason).toBe("stop");
    // flow made: token -> session -> pow -> completion
    expect(calls.some((c) => c.url.includes("/v0/users/current"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/v0/chat_session/create"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/v0/chat/create_pow_challenge"))).toBe(true);
    expect(calls.some((c) => c.url.includes("/v0/chat/completion"))).toBe(true);
  });

  it("stream: returns SSE chunks and [DONE]", async () => {
    const result = await executor.execute({
      model: "deepseek-chat",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: { apiKey: "user-token-123" },
    });
    expect(result.response.status).toBe(200);
    const text = await result.response.text();
    expect(text).toContain("data: ");
    expect(text).toContain('"content":"Hello from "');
    expect(text).toContain('"content":"DeepSeek!"');
    expect(text).toContain("data: [DONE]");
  });

  it("rejects invalid credentials with 400", async () => {
    const result = await executor.execute({
      model: "deepseek-chat",
      body: { messages: [] },
      stream: false,
      credentials: {},
    });
    expect(result.response.status).toBe(400);
    const json = await result.response.json();
    expect(json.error.message).toContain("Invalid credentials");
  });
});
