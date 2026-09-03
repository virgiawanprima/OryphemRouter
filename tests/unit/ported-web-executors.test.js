import { describe, it, expect, vi } from "vitest";
import { getExecutor } from "open-sse/executors/index.js";

const EXECUTORS = {
  "deepseek-web": "DeepSeekWebExecutor",
  "felo-web": "FeloWebExecutor",
  hyperagent: "HyperAgentExecutor",
  "copilot-web": "CopilotWebExecutor",
  "devin-desktop": "DevinDesktopExecutor",
  "veoaifree-web": "VeoAIFreeWebExecutor",
  "inner-ai": "InnerAiExecutor",
  "blackbox-web": "BlackboxWebExecutor",
  "gemini-web": "GeminiWebExecutor",
  huggingchat: "HuggingChatExecutor",
  promptql: "PromptQlExecutor",
  auggie: "AuggieExecutor",
  "t3-web": "T3ChatWebExecutor",
  lmarena: "LMArenaExecutor",
  "chatgpt-web": "ChatGptWebExecutor",
  "claude-web": "ClaudeWebExecutor",
  "notion-web": "NotionWebExecutor",
  "yuanbao-web": "YuanbaoWebExecutor",
  "muse-spark-web": "MuseSparkWebExecutor",
  "duckduckgo-web": "DuckDuckGoWebExecutor",
  gitlab: "GitlabExecutor",
  "conol-web": "ConolWebExecutor",
  "zai-web": "ZaiWebExecutor",
  "copilot-m365-web": "CopilotM365WebExecutor",
};

describe("ported web executors registration", () => {
  it("all 24 ported executors are wired and resolve to the right class", () => {
    for (const [id, className] of Object.entries(EXECUTORS)) {
      const exec = getExecutor(id);
      expect(exec.constructor.name, `${id} executor`).toBe(className);
    }
  });
});

// Deterministic credential-error paths (no network needed).
describe("ported web executors credential errors", () => {
  it("inner-ai rejects missing token with 401", async () => {
    const r = await getExecutor("inner-ai").execute({
      model: "gpt-4o", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(401);
  });

  it("t3-web rejects missing cookie with 400", async () => {
    const r = await getExecutor("t3-web").execute({
      model: "x", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(400);
  });

  it("blackbox-web rejects missing cookie with 403", async () => {
    const r = await getExecutor("blackbox-web").execute({
      model: "x", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(403);
  });

  it("huggingchat rejects missing cookie with 401", async () => {
    const r = await getExecutor("huggingchat").execute({
      model: "x", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(401);
  });

  it("gemini-web rejects missing cookie with 401", async () => {
    const r = await getExecutor("gemini-web").execute({
      model: "x", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(401);
  });

  it("promptql rejects missing token with 401", async () => {
    const r = await getExecutor("promptql").execute({
      model: "x", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(401);
  });

  it("devin-desktop rejects missing token with 401", async () => {
    const r = await getExecutor("devin-desktop").execute({
      model: "swe-1-7", body: { messages: [{ role: "user", content: "hi" }] }, stream: false, credentials: {},
    });
    expect((r?.response ?? r).status).toBe(401);
  });
});
