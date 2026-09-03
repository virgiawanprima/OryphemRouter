/**
 * Unit tests for the batch-2 newly-integrated executors (open-sse/executors).
 *
 * Covers:
 *  1. Registration — every new executor id is registered in
 *     open-sse/executors/index.js under the expected concrete class
 *     (asserted via `getExecutor(id).constructor.name`).
 *  2. Error path — for a representative sample, `execute()` is called with
 *     empty credentials (`{}`) and a stubbed global fetch returning HTTP 500.
 *     Each call must resolve to a Response (or a `{ response }` object) that
 *     carries a status — proving the error path works without any real network.
 *
 * The fetch stub is installed with `vi.hoisted` BEFORE the executor modules are
 * imported because open-sse/utils/proxyFetch.js (used by the
 * BaseExecutor/DefaultExecutor path) captures `globalThis.fetch` at module load
 * time as its internal `originalFetch`. Executors that call the global `fetch`
 * directly (glm, qwen-web, nlpcloud, raycast, theoldllm) resolve to the same
 * stub at call time. bedrock returns a 401 without any fetch (empty key).
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

import { getExecutor } from "open-sse/executors/index.js";

/**
 * The 41 batch-2 executors: id → expected constructor.name.
 * (ids verified against the executors map in open-sse/executors/index.js)
 */
const NEW_EXECUTORS = {
  "adapta-web": "AdaptaWebExecutor",
  "adobe-firefly": "AdobeFireflyExecutor",
  "azure-ai": "AzureAiExecutor",
  "azure-openai": "AzureOpenAIExecutor",
  bedrock: "BedrockExecutor",
  "chatgpt-web-codex": "ChatGptWebCodexExecutor",
  cheaperinference: "CheaperInferenceExecutor",
  chipotle: "ChipotleExecutor",
  cliproxyapi: "CliproxyapiExecutor",
  "cloudflare-ai": "CloudflareAIExecutor",
  "cloudflare-playground": "CloudflarePlaygroundExecutor",
  "codex-app-server": "CodexAppServerExecutor",
  dario: "DarioExecutor",
  "devin-cli-agentic": "DevinCliAgenticExecutor",
  "doubao-web": "DoubaoWebExecutor",
  freebuff: "FreebuffExecutor",
  "gemini-business": "GeminiBusinessExecutor",
  "ghe-copilot": "GheCopilotExecutor",
  glm: "GlmExecutor",
  "hailuo-web": "HailuoWebExecutor",
  kie: "KieExecutor",
  kimi: "KimiExecutor",
  "kimi-web": "KimiWebExecutor",
  "microsoft-designer-web": "MicrosoftDesignerWebExecutor",
  moonshot: "MoonshotExecutor",
  ninerouter: "NineRouterExecutor",
  nlpcloud: "NlpCloudExecutor",
  "poe-web": "PoeWebExecutor",
  pollinations: "PollinationsExecutor",
  "qwen-web": "QwenWebExecutor",
  raycast: "RaycastExecutor",
  "tencent-aistudio-web": "TencentAIStudioWebExecutor",
  theoldllm: "TheOldLlmExecutor",
  "tinycms-web": "TinyCmsExecutor",
  "v0-vercel-web": "V0VercelWebExecutor",
  "venice-web": "VeniceWebExecutor",
  xai: "XaiExecutor",
  zcode: "ZcodeExecutor",
  "zed-hosted": "ZedHostedExecutor",
  "zenmux-free": "ZenmuxFreeExecutor",
  "deepseek-web-with-auto-refresh": "DeepSeekWebWithAutoRefreshExecutor",
};

/** Representative sample whose error path is exercised without network. */
const SAMPLE_EXECUTORS = [
  "glm",
  "kimi",
  "qwen-web",
  "moonshot",
  "nlpcloud",
  "raycast",
  "xai",
  "theoldllm",
  "pollinations",
  "bedrock",
];

function statusOf(result) {
  if (result instanceof Response) return result.status;
  if (result && typeof result === "object" && result.response) {
    return result.response instanceof Response
      ? result.response.status
      : result.response?.status;
  }
  return undefined;
}

describe("batch-2 executor registration", () => {
  it("registers all 41 new executors with the expected concrete class", () => {
    const ids = Object.keys(NEW_EXECUTORS);
    expect(ids.length).toBe(41);
    for (const id of ids) {
      const executor = getExecutor(id);
      expect(executor.constructor.name, `getExecutor("${id}").constructor.name`).toBe(
        NEW_EXECUTORS[id]
      );
    }
  });

  it("every sampled executor id is present in the 41-executor map", () => {
    for (const id of SAMPLE_EXECUTORS) {
      expect(NEW_EXECUTORS, `sample id "${id}" must be in NEW_EXECUTORS`).toHaveProperty(id);
    }
  });
});

describe("batch-2 executor error path (no real network)", () => {
  it("execute() with empty credentials + fetch→500 returns a status-carrying result", async () => {
    for (const id of SAMPLE_EXECUTORS) {
      const executor = getExecutor(id);
      // pollinations throws for premium keyless models before any I/O;
      // use a free keyless model so the anonymous path runs.
      const model = id === "pollinations" ? "openai" : "batch2-test-model";
      const result = await executor.execute({
        model,
        body: { messages: [{ role: "user", content: "ping" }] },
        stream: false,
        credentials: {},
        log: null,
      });

      const status = statusOf(result);
      expect(status, `${id} execute() should resolve to a Response/{response} with a status`).toBeDefined();
      expect(status, `${id} error-path status should be >= 400`).toBeGreaterThanOrEqual(400);
      expect(status, `${id} error-path status should be a sane HTTP status (< 600)`).toBeLessThan(600);
    }
  });

  it("the stubbed fetch was actually used (no real network)", () => {
    // 9 of the 10 samples (all but bedrock) reach fetch; bedrock returns a
    // synthetic 401 before any I/O. The stub must have been invoked at least
    // once, proving network was intercepted.
    expect(fetchStub).toHaveBeenCalled();
  });
});
