// OpenCode Go — transport + model catalog.
//
// Per-model `supportedFormats` mirrors the provider's OWN endpoint table
// (https://opencode.ai/docs/go/ → "Endpoints"), which is authoritative for what the
// gateway actually serves:
//   /zen/go/v1/chat/completions → GLM (all), Kimi (all), LongCat, DeepSeek (all),
//                                 MiMo, Hy3, Hy4
//   /zen/go/v1/messages         → MiniMax (all), Qwen (all)   ← Anthropic wire format
//   /zen/go/v1/responses        → Grok 4.6, GPT 5.6 Luna, Muse Spark (contributor)
//
// Declaring this per model is what lets chatCore pick a format the model ACTUALLY
// supports. Declaring `openai` for a /messages-only model (or `claude`/`openai-responses`
// for a chat-only one) makes the router speak an endpoint the gateway does not serve —
// the failure that sent these models to /chat/completions in 9Router.
export default {
  id: "opencode-go",
  priority: 210,
  alias: "opencode-go",
  aliases: [
    "ocg",
  ],
  uiAlias: "ocg",
  display: {
    name: "OpenCode Go",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
    website: "https://opencode.ai/auth",
    notice: {
      text: "OpenCode Go subscription: $10/mo. Access to Kimi, GLM, Qwen, MiMo, MiniMax, DeepSeek & more.",
      apiKeyUrl: "https://opencode.ai/auth",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    validateUrl: "https://opencode.ai/zen/go/v1/models",
    headers: {},
  },
  // Multi-endpoint: pick the transport matching the client sourceFormat to skip
  // translation. Guarded per-model by `supportedFormats` (see chatCore) because
  // opencode-go models differ in endpoint support.
  transports: [
    { format: "openai", baseUrl: "https://opencode.ai/zen/go/v1/chat/completions", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
    { format: "claude", baseUrl: "https://opencode.ai/zen/go/v1/messages", auth: { combined: true, header: "x-api-key", scheme: "raw", anthropicVersion: true } },
    { format: "openai-responses", baseUrl: "https://opencode.ai/zen/go/v1/responses", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
  ],
  models: [
    // ── /chat/completions ────────────────────────────────────────────────
    { id: "glm-5.3-flash", name: "GLM-5.3 Flash", supportedFormats: ["openai"] },
    { id: "glm-5.3", name: "GLM-5.3", supportedFormats: ["openai"] },
    { id: "glm-5.2", name: "GLM-5.2", supportedFormats: ["openai"] },
    { id: "glm-5.1", name: "GLM-5.1", supportedFormats: ["openai"] },
    { id: "kimi-k3", name: "Kimi K3", supportedFormats: ["openai"] },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", supportedFormats: ["openai"] },
    { id: "kimi-k2.6", name: "Kimi K2.6", supportedFormats: ["openai"] },
    { id: "longcat-2.0", name: "LongCat-2.0", supportedFormats: ["openai"] },
    { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", supportedFormats: ["openai"] },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", supportedFormats: ["openai"] },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", supportedFormats: ["openai"] },
    { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp", supportedFormats: ["openai"] },
    { id: "mimo-v2.5", name: "MiMo V2.5", supportedFormats: ["openai"] },
    { id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro", supportedFormats: ["openai"] },
    { id: "hy4-preview", name: "Hy4 Preview", supportedFormats: ["openai"] },
    { id: "hy3", name: "Hy3", supportedFormats: ["openai"] },

    // ── /messages (Anthropic wire format) ────────────────────────────────
    { id: "minimax-m3", name: "MiniMax M3", supportedFormats: ["claude"] },
    { id: "minimax-m2.7", name: "MiniMax M2.7", supportedFormats: ["claude"] },
    { id: "minimax-m2.5", name: "MiniMax M2.5", supportedFormats: ["claude"] },
    { id: "qwen3.8-max", name: "Qwen3.8 Max", supportedFormats: ["claude"] },
    { id: "qwen3.8-flash", name: "Qwen3.8 Flash", supportedFormats: ["claude"] },
    { id: "qwen3.7-max", name: "Qwen3.7 Max", supportedFormats: ["claude"] },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus", supportedFormats: ["claude"] },
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus", supportedFormats: ["claude"] },

    // ── /responses ───────────────────────────────────────────────────────
    { id: "grok-4.6", name: "Grok 4.6", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.2-contributor", name: "Muse Spark 1.2 Contributor", supportedFormats: ["openai-responses"] },
  ],
};
