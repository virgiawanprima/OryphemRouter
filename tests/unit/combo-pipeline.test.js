import { describe, it, expect, vi } from "vitest";
import { handleComboChat, handlePipelineChat } from "open-sse/services/combo.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function chatResponse(text) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
}

describe("combo.js — pipeline strategy (chain steps, feed output to next)", () => {
  it("aborts on the first failing step and returns its error", async () => {
    const seen = [];
    const res = await handlePipelineChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["openai/gpt-4o", "anthropic/claude"],
      handleSingleModel: async (_b, m) => {
        seen.push(m);
        return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });
      },
      log,
    });
    expect(res.status).toBe(500);
    expect(seen).toEqual(["openai/gpt-4o"]); // stops after first failure
  });

  it("feeds each step's output into the next step (chained context)", async () => {
    const bodies = [];
    const res = await handlePipelineChat({
      body: { messages: [{ role: "user", content: "start" }] },
      models: ["openai/gpt-4o", "anthropic/claude"],
      handleSingleModel: async (b, m) => {
        bodies.push(JSON.parse(JSON.stringify(b)));
        if (m === "openai/gpt-4o") return chatResponse("first output");
        return chatResponse("second output");
      },
      log,
    });
    expect(res.status).toBe(200);
    // First call: original body. Second call: original + assistant output fed in.
    expect(bodies[0].messages.length).toBe(1);
    expect(bodies[1].messages.length).toBeGreaterThan(1);
    expect(JSON.stringify(bodies[1].messages)).toContain("first output");
  });

  it("returns the last step's result on success", async () => {
    const res = await handlePipelineChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["a/m1", "b/m2"],
      handleSingleModel: async () => chatResponse("final"),
      log,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ choices: [{ message: { content: "final" } }] });
  });

  it("feeds SSE (streaming) step output into the next step", async () => {
    const bodies = [];
    const sseResponse = (chunks) => new Response(
      chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
    await handlePipelineChat({
      body: { messages: [{ role: "user", content: "start" }] },
      models: ["openai/gpt-4o", "anthropic/claude"],
      handleSingleModel: async (b, m) => {
        bodies.push(JSON.parse(JSON.stringify(b)));
        return m === "openai/gpt-4o" ? sseResponse(["hel", "lo world"]) : chatResponse("done");
      },
      log,
    });
    expect(bodies[0].messages.length).toBe(1);
    expect(JSON.stringify(bodies[1].messages)).toContain("hello world");
  });

  it("handles non-JSON intermediate response without breaking the chain", async () => {
    const seen = [];
    const res = await handlePipelineChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["a/m1", "b/m2"],
      handleSingleModel: async (_b, m) => {
        seen.push(m);
        return m === "a/m1" ? new Response("not-json-stream", { status: 200 }) : chatResponse("ok");
      },
      log,
    });
    expect(seen).toEqual(["a/m1", "b/m2"]);
    expect(res.status).toBe(200);
  });

  it("handleComboChat invokes onModelSuccess with the winning model", async () => {
    let won = null;
    const res = await handleComboChat({
      body: { messages: [{ role: "user", content: "hi" }] },
      models: ["openai/gpt-4o", "anthropic/claude"],
      handleSingleModel: async (_b, m) => (m === "openai/gpt-4o" ? new Response("failed", { status: 500 }) : chatResponse("ok")),
      log,
      comboName: "c1",
      comboStrategy: "fallback",
      onModelSuccess: async (m) => { won = m; },
    });
    expect(res.status).toBe(200);
    expect(won).toBe("anthropic/claude"); // the model that succeeded
  });
});
