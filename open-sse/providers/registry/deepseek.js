import { CLAUDE_API_HEADERS } from "../shared.js";

export default {
  id: "deepseek",
  priority: 110,
  alias: "deepseek",
  aliases: [
    "ds",
  ],
  uiAlias: "ds",
  display: {
    name: "DeepSeek",
    icon: "bolt",
    color: "#4D6BFE",
    textIcon: "DS",
    website: "https://deepseek.com",
    notice: {
      apiKeyUrl: "https://platform.deepseek.com/api_keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.deepseek.com/chat/completions",
    validateUrl: "https://api.deepseek.com/models",
    reasoningInject: {
      scope: "all",
    },
  },
  // Multi-endpoint: pick the transport matching client sourceFormat to skip translation.
  transports: [
    {
      format: "openai",
      baseUrl: "https://api.deepseek.com/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
    {
      format: "claude",
      baseUrl: "https://api.deepseek.com/anthropic/v1/messages",
      headers: { ...CLAUDE_API_HEADERS },
      auth: { combined: true, header: "x-api-key", scheme: "raw" },
    },
    {
      // DeepSeek docs (api-docs.deepseek.com/guides/responses_api): "our API now supports
      // the Responses API format, with the base_url being https://api.deepseek.com" — the
      // OpenAI SDK appends /responses to that base. Without this entry a Responses-format
      // client (Codex) was translated down to chat instead of using the native endpoint.
      format: "openai-responses",
      baseUrl: "https://api.deepseek.com/responses",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
  ],
  // Per-model formats. The docs' compatibility matrix carries a "Responses API" row marked ✓
  // for both current models, so they get all three. This ALSO has to be declared, not left to
  // the provider-level list: chatCore falls back to the CLIENT's format for undeclared models,
  // and now that a responses transport exists that would silently drag the legacy aliases onto
  // /responses — where only `deepseek-flash` is documented. They keep chat + messages, i.e.
  // today's behaviour.
  models: [
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", supportedFormats: ["openai", "claude", "openai-responses"] },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", supportedFormats: ["openai", "claude", "openai-responses"] },
    { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision (Experimental)", supportedFormats: ["openai", "claude", "openai-responses"] },
    // Legacy aliases accepted by DeepSeek that resolve to the latest model — named
    // honestly instead of claiming a stale version.
    { id: "deepseek-chat", name: "DeepSeek Chat (legacy alias → latest)", supportedFormats: ["openai", "claude"] },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner (legacy alias → latest)", supportedFormats: ["openai", "claude"] },
  ],
  features: {
    usage: true,
    usageApikey: true,
  },
};
