/**
 * DeepSeek transport — the Responses endpoint is now declared.
 *
 * DeepSeek's docs state the API supports the Responses API with base_url
 * https://api.deepseek.com (the OpenAI SDK appends /responses), and the compatibility matrix
 * marks "Responses API" ✓ for both current models. Undeclared, a Responses-format client
 * (e.g. Codex) was translated down to chat instead of using the native endpoint.
 *
 * The per-model declarations are what keep that safe: chatCore routes an undeclared model by
 * the CLIENT's format, so without them the two legacy aliases would have been dragged onto
 * /responses too.
 */

import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { getModelSupportedFormats } from "../../open-sse/config/providerModels.js";
import { resolveTransport } from "../../open-sse/services/provider.js";

const CHAT = "https://api.deepseek.com/chat/completions";
const MESSAGES = "https://api.deepseek.com/anthropic/v1/messages";
const RESPONSES = "https://api.deepseek.com/responses";

function pick(sourceFormat, model) {
  const declared = getModelSupportedFormats("deepseek", model);
  const format = declared
    ? (declared.includes(sourceFormat) ? sourceFormat : declared[0])
    : sourceFormat;
  return resolveTransport("deepseek", format);
}

describe("DeepSeek transport declarations", () => {
  it("declares chat, messages and responses endpoints", () => {
    expect((PROVIDERS.deepseek.transports || []).map((t) => t.format))
      .toEqual(["openai", "claude", "openai-responses"]);
    expect(resolveTransport("deepseek", "openai-responses").baseUrl).toBe(RESPONSES);
    expect(resolveTransport("deepseek", "claude").baseUrl).toBe(MESSAGES);
    expect(resolveTransport("deepseek", "openai").baseUrl).toBe(CHAT);
  });

  it("gives the current models all three formats", () => {
    for (const id of ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
      expect(getModelSupportedFormats("deepseek", id), id)
        .toEqual(["openai", "claude", "openai-responses"]);
    }
  });

  it("sends a Responses-format client to the native /responses endpoint", () => {
    expect(pick("openai-responses", "deepseek-v4-pro")?.baseUrl).toBe(RESPONSES);
  });

  it("ANTI-REGRESSION: legacy aliases are not dragged onto /responses", () => {
    // Only `deepseek-flash` is documented for the Responses guide's compatibility table;
    // these aliases keep chat + messages exactly as before the responses transport existed.
    for (const id of ["deepseek-chat", "deepseek-reasoner"]) {
      expect(getModelSupportedFormats("deepseek", id), id).toEqual(["openai", "claude"]);
      expect(pick("openai-responses", id)?.baseUrl, id).toBe(CHAT);
      expect(pick("claude", id)?.baseUrl, id).toBe(MESSAGES);
    }
  });
});
