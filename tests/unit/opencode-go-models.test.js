import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS, getModelSupportedFormats } from "../../open-sse/config/providerModels.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { resolveTransport } from "../../open-sse/services/provider.js";

// The provider's OWN endpoint table (https://opencode.ai/docs/go/ → "Endpoints") is the
// source of truth for which wire format each model speaks. These groups mirror it.
const FORMAT_CHAT = [
  "glm-5.3-flash", "glm-5.3", "glm-5.2", "glm-5.1",
  "kimi-k3", "kimi-k2.7-code", "kimi-k2.6",
  "longcat-2.0",
  "deepseek-v4.1-flash", "deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp",
  "mimo-v2.5", "mimo-v2.5-pro",
  "hy4-preview", "hy3",
];
const FORMAT_MESSAGES = [
  "minimax-m3", "minimax-m2.7", "minimax-m2.5",
  "qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus",
];
const FORMAT_RESPONSES = [
  "grok-4.6", "gpt-5.6-luna",
  "muse-spark-1.3-contributor", "muse-spark-1.2-contributor",
];
const DOCUMENTED_MODELS = [...FORMAT_CHAT, ...FORMAT_MESSAGES, ...FORMAT_RESPONSES];

const CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const MESSAGES_URL = "https://opencode.ai/zen/go/v1/messages";
const RESPONSES_URL = "https://opencode.ai/zen/go/v1/responses";

// Mirror of chatCore's transport pick: speak the client's sourceFormat when the model
// declares it (zero translation); otherwise speak a format the model DOES declare —
// never the provider default, which is what sent /messages-only models to chat.
function pickTransport(provider, sourceFormat, alias, model) {
  const declared = getModelSupportedFormats(alias, model);
  const format = declared
    ? (declared.includes(sourceFormat) ? sourceFormat : declared[0])
    : sourceFormat;
  return resolveTransport(provider, format);
}

describe("OpenCode Go model catalog", () => {
  it("matches the documented model IDs", () => {
    const ids = (PROVIDER_MODELS["opencode-go"] || []).map((m) => m.id);
    expect(ids).toEqual(DOCUMENTED_MODELS);
  });

  it("covers every group the provider documents (no group silently empty)", () => {
    for (const group of [FORMAT_CHAT, FORMAT_MESSAGES, FORMAT_RESPONSES]) {
      expect(group.length).toBeGreaterThan(0);
    }
  });
});

describe("OpenCode Go per-model supportedFormats", () => {
  it("declares [openai] for chat-only models (GLM/Kimi/LongCat/DeepSeek/MiMo/Hy)", () => {
    for (const m of FORMAT_CHAT) {
      expect(getModelSupportedFormats("opencode-go", m), m).toEqual(["openai"]);
    }
  });

  it("declares [claude] for /messages-only models (MiniMax/Qwen)", () => {
    // NOT ["openai","claude"]: the provider serves these on /messages only, so allowing
    // chat would route them to an endpoint that is not offered.
    for (const m of FORMAT_MESSAGES) {
      expect(getModelSupportedFormats("opencode-go", m), m).toEqual(["claude"]);
    }
  });

  it("declares [openai-responses] for responses-only models", () => {
    for (const m of FORMAT_RESPONSES) {
      expect(getModelSupportedFormats("opencode-go", m), m).toEqual(["openai-responses"]);
    }
  });
});

describe("OpenCode Go multi-endpoint transports", () => {
  it("declares openai / claude / openai-responses transports", () => {
    const formats = (PROVIDERS["opencode-go"].transports || []).map((t) => t.format);
    expect(formats).toEqual(["openai", "claude", "openai-responses"]);
  });

  it("resolveTransport maps each format to the documented URL", () => {
    expect(resolveTransport("opencode-go", "openai").baseUrl).toBe(CHAT_URL);
    expect(resolveTransport("opencode-go", "claude").baseUrl).toBe(MESSAGES_URL);
    expect(resolveTransport("opencode-go", "openai-responses").baseUrl).toBe(RESPONSES_URL);
  });

  it("uses x-api-key + anthropicVersion on the claude transport", () => {
    const t = resolveTransport("opencode-go", "claude");
    expect(t.auth.header).toBe("x-api-key");
    expect(t.auth.anthropicVersion).toBe(true);
  });
});

describe("OpenCode Go transport pick (chatCore logic)", () => {
  it("routes MiniMax/Qwen to /messages even for a CHAT client", () => {
    // Regression: these used to fall back to the provider default (/chat/completions)
    // because the model did not declare `openai`, so a chat-format client had no
    // working route. 9Router measured a 500 for minimax-m2.7 on the chat endpoint.
    for (const m of FORMAT_MESSAGES) {
      expect(pickTransport("opencode-go", "openai", "opencode-go", m)?.baseUrl, m).toBe(MESSAGES_URL);
      expect(pickTransport("opencode-go", "claude", "opencode-go", m)?.baseUrl, m).toBe(MESSAGES_URL);
    }
  });

  it("routes responses-only models to /responses for a chat client", () => {
    for (const m of FORMAT_RESPONSES) {
      expect(pickTransport("opencode-go", "openai", "opencode-go", m)?.baseUrl, m).toBe(RESPONSES_URL);
    }
  });

  it("keeps chat-only models on /chat/completions and never sends them to /messages", () => {
    for (const m of FORMAT_CHAT) {
      expect(pickTransport("opencode-go", "openai", "opencode-go", m)?.baseUrl, m).toBe(CHAT_URL);
      expect(pickTransport("opencode-go", "claude", "opencode-go", m)?.baseUrl, m).toBe(CHAT_URL);
    }
  });

  it("leaves undeclared models on the previous behaviour (provider default)", () => {
    // A model with no supportedFormats declaration is unaffected by the pick logic.
    expect(pickTransport("opencode-go", "openai", "opencode-go", "some-custom-model")?.baseUrl).toBe(CHAT_URL);
  });

  it("returns no transport for providers that declare none", () => {
    // `openai` has a single transport, not a transports[] list → nothing to pick.
    expect(pickTransport("openai", "openai", "openai", "gpt-5.4")).toBeNull();
  });
});
