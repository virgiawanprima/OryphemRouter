/**
 * OpenCode zen (oc) transport — per-model formats taken from the provider's endpoint table
 * (opencode.ai/docs/zen).
 *
 * The registry used to declare no models and no transports, so every model was sent to
 * /chat/completions — which is wrong for all GPT (/responses) and all Claude + Qwen
 * (/messages). The pairs must stay together: transports[] without the catalog is a
 * REGRESSION, not a fix, because chatCore falls back to the client's own format for
 * undeclared models.
 */

import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { getModelSupportedFormats } from "../../open-sse/config/providerModels.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";

const CHAT = "https://opencode.ai/zen/v1/chat/completions";
const MESSAGES = "https://opencode.ai/zen/v1/messages";
const RESPONSES = "https://opencode.ai/zen/v1/responses";

// Mirror of chatCore's transport pick: speak the client's sourceFormat when the model declares
// it, otherwise speak one the model DOES declare, otherwise leave it to the provider default.
function pick(provider, sourceFormat, alias, model) {
  const declared = getModelSupportedFormats(alias, model);
  const format = declared
    ? (declared.includes(sourceFormat) ? sourceFormat : declared[0])
    : sourceFormat;
  return resolveTransport(provider, format);
}

describe("OpenCode zen transport — documented per-model formats", () => {
  it("declares the three static-format transports", () => {
    expect((PROVIDERS.opencode.transports || []).map((t) => t.format))
      .toEqual(["openai", "claude", "openai-responses"]);
  });

  it("maps documented models to their documented endpoint group", () => {
    for (const id of ["claude-opus-5", "claude-haiku-4-5", "qwen3.7-max", "qwen3.5-plus"]) {
      expect(getModelSupportedFormats("opencode", id), id).toEqual(["claude"]);
    }
    for (const id of ["gpt-5.5", "gpt-6-astra", "grok-4.6", "muse-spark-1.3", "muse-spark-1.3-contributor-free"]) {
      expect(getModelSupportedFormats("opencode", id), id).toEqual(["openai-responses"]);
    }
    for (const id of ["kimi-k3", "glm-5.3-flash", "deepseek-v4-flash", "minimax-m3", "big-pickle"]) {
      expect(getModelSupportedFormats("opencode", id), id).toEqual(["openai"]);
    }
  });

  it("routes a chat client to the endpoint the model actually speaks", () => {
    expect(pick("opencode", "openai", "opencode", "gpt-5.5")?.baseUrl).toBe(RESPONSES);
    expect(pick("opencode", "openai", "opencode", "claude-opus-5")?.baseUrl).toBe(MESSAGES);
    expect(pick("opencode", "openai", "opencode", "kimi-k3")?.baseUrl).toBe(CHAT);
  });

  it("routes a claude client directly when the model speaks claude", () => {
    expect(pick("opencode", "claude", "opencode", "claude-opus-5")?.baseUrl).toBe(MESSAGES);
  });

  it("ANTI-REGRESSION: a claude client keeps chat-only models on /chat/completions", () => {
    // Without the per-model catalog these would be sent to /messages and start failing, which
    // is exactly the trap that makes transports[] alone unsafe here.
    for (const m of ["kimi-k3", "glm-5.3-flash", "deepseek-v4-flash", "minimax-m3"]) {
      expect(pick("opencode", "claude", "opencode", m)?.baseUrl, m).toBe(CHAT);
    }
  });

  it("leaves undeclared models on the chat fallback", () => {
    expect(pick("opencode", "openai", "opencode", "some-future-model")?.baseUrl).toBe(CHAT);
  });

  it("keeps Gemini undeclared — its endpoint is a per-model path, not a format", () => {
    expect(getModelSupportedFormats("opencode", "gemini-3.8-flash")).toBeNull();
    expect(pick("opencode", "openai", "opencode", "gemini-3.8-flash")?.baseUrl).toBe(CHAT);
  });
});

describe("OpenCodeExecutor.buildUrl", () => {
  it("prefers the transport chatCore selected", () => {
    const ex = new OpenCodeExecutor();
    expect(ex.buildUrl("claude-opus-5", true, 0, { runtimeTransport: { baseUrl: MESSAGES } })).toBe(MESSAGES);
    expect(ex.buildUrl("gpt-5.5", true, 0, { runtimeTransport: { baseUrl: RESPONSES } })).toBe(RESPONSES);
  });

  it("falls back to the model's declared format, then to chat", () => {
    const ex = new OpenCodeExecutor();
    expect(ex.buildUrl("gpt-5.5")).toBe(RESPONSES);
    expect(ex.buildUrl("claude-opus-5")).toBe(MESSAGES);
    expect(ex.buildUrl("kimi-k3")).toBe(CHAT);
    expect(ex.buildUrl("some-future-model")).toBe(CHAT);
  });
});
