import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeloWebExecutor } from "open-sse/executors/felo-web.js";

function feloStreamBody(textParts) {
  const encoder = new TextEncoder();
  const lines = textParts.map((t) => {
    const inner = JSON.stringify({ data: { type: "answer", data: { text: t } } });
    return `data:${JSON.stringify({ content: inner })}`;
  });
  const stream = new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(encoder.encode(l + "\n"));
      c.close();
    },
  });
  return stream;
}

describe("Felo Web executor (ported from OmniRoute)", () => {
  const executor = new FeloWebExecutor();

  beforeEach(() => {
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/api-proxy/main/search/threads")) {
        return new Response(JSON.stringify({ stream_key: "sk-test-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/api/message/v1/stream/")) {
        return new Response(feloStreamBody(["Hello ", "Hello Felo!"]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("{}", { status: 200 });
    });
  });

  afterEach(() => delete global.fetch);

  it("non-stream: returns accumulated answer", async () => {
    const result = await executor.execute({
      model: "felo",
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: false,
      credentials: {},
    });
    expect((result?.response ?? result).status).toBe(200);
    const json = await (result?.response ?? result).json();
    expect(json.choices[0].message.content).toBe("Hello Felo!");
  });

  it("stream: emits OpenAI SSE chunks + [DONE]", async () => {
    const result = await executor.execute({
      model: "felo",
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: true,
      credentials: {},
    });
    const text = await (result?.response ?? result).text();
    expect(text).toContain("data: [DONE]");
    expect(text).toContain('"content":"Hello "');
  });

  it("rejects empty messages", async () => {
    const result = await executor.execute({
      model: "felo",
      body: { messages: [] },
      stream: false,
      credentials: {},
    });
    expect((result?.response ?? result).status).toBe(400);
  });
});
