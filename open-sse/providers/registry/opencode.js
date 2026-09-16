// OpenCode Zen (oc) — transport + curated model catalog.
//
// opencode.ai/docs/zen publishes a per-model endpoint table. Only part of the catalog speaks
// chat, so `supportedFormats` matters here:
//   /zen/v1/responses        all GPT, Grok 4.6/4.5, Grok Build 0.1, Muse Spark 1.3/1.2 (+contributor-free)
//   /zen/v1/messages         all Claude, Qwen3.7-Max / 3.7-Plus / 3.6-Plus / 3.5-Plus
//   /zen/v1/chat/completions DeepSeek, MiniMax, GLM, Kimi, and the free models
//   /zen/v1/models/<id>      all Gemini — a PER-MODEL path, NOT expressible as a format
//
// ⚠️ The transports[] and the per-model catalog must stay together. Adding transports[] alone
// would regress: chatCore falls back to the client's own format when a model declares nothing,
// so a claude client asking for a chat-only model (Kimi, GLM, DeepSeek) would be sent to
// /messages and start failing where it works today.
//
// Gemini models are deliberately NOT listed: their endpoint is per-model, which the
// `{ format, baseUrl }` transport shape cannot express. Leaving them undeclared keeps today's
// behaviour (they fall back to chat) rather than pretending they are routable.
//
// Display names are omitted on purpose — `normalizeModel` derives them, and the enrichment
// layers (metadata.js / generatedMetadata.js) supply the curated ones. Transcribing 60+ names
// by hand would only add chances to introduce a typo.
export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  // opencode upstream now requires a real API key for chat (the model catalog
  // is public, but chat returns 401 without a key). Keep noAuth so the free
  // catalog still surfaces, but allow an optional API key connection.
  authModes: ["apikey"],
  authHint: "OpenCode Free — optional API key. Chat requires a key; the model list is public.",
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    noAuth: true,
  },
  transports: [
    { format: "openai", baseUrl: "https://opencode.ai/zen/v1/chat/completions", auth: { combined: true, header: "Authorization", scheme: "bearer", noAuth: true } },
    { format: "claude", baseUrl: "https://opencode.ai/zen/v1/messages", auth: { combined: true, header: "x-api-key", scheme: "raw", anthropicVersion: true, noAuth: true } },
    { format: "openai-responses", baseUrl: "https://opencode.ai/zen/v1/responses", auth: { combined: true, header: "Authorization", scheme: "bearer", noAuth: true } },
  ],
  models: [
    // ── /zen/v1/responses ────────────────────────────────────────────────
    { id: "gpt-6-astra", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-sol", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-terra", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-luna", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.5", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.5-pro", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4-pro", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4-mini", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4-nano", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.3-codex", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.3-codex-spark", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.2", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.2-codex", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1-codex", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1-codex-max", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1-codex-mini", supportedFormats: ["openai-responses"] },
    { id: "gpt-5", supportedFormats: ["openai-responses"] },
    { id: "gpt-5-codex", supportedFormats: ["openai-responses"] },
    { id: "gpt-5-nano", supportedFormats: ["openai-responses"] },
    { id: "grok-4.6", supportedFormats: ["openai-responses"] },
    { id: "grok-4.5", supportedFormats: ["openai-responses"] },
    { id: "grok-build-0.1", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.3", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.2", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.3-contributor-free", supportedFormats: ["openai-responses"] },

    // ── /zen/v1/messages ─────────────────────────────────────────────────
    { id: "claude-fable-5-1", supportedFormats: ["claude"] },
    { id: "claude-fable-5", supportedFormats: ["claude"] },
    { id: "claude-opus-5", supportedFormats: ["claude"] },
    { id: "claude-opus-4-8", supportedFormats: ["claude"] },
    { id: "claude-opus-4-7", supportedFormats: ["claude"] },
    { id: "claude-opus-4-6", supportedFormats: ["claude"] },
    { id: "claude-opus-4-5", supportedFormats: ["claude"] },
    { id: "claude-sonnet-5", supportedFormats: ["claude"] },
    { id: "claude-sonnet-4-6", supportedFormats: ["claude"] },
    { id: "claude-sonnet-4-5", supportedFormats: ["claude"] },
    { id: "claude-haiku-4-5", supportedFormats: ["claude"] },
    { id: "qwen3.7-max", supportedFormats: ["claude"] },
    { id: "qwen3.7-plus", supportedFormats: ["claude"] },
    { id: "qwen3.6-plus", supportedFormats: ["claude"] },
    { id: "qwen3.5-plus", supportedFormats: ["claude"] },

    // ── /zen/v1/chat/completions ─────────────────────────────────────────
    { id: "deepseek-v4-pro", supportedFormats: ["openai"] },
    { id: "deepseek-v4-flash", supportedFormats: ["openai"] },
    { id: "deepseek-v4-flash-vision-exp", supportedFormats: ["openai"] },
    { id: "minimax-m3", supportedFormats: ["openai"] },
    { id: "minimax-m2.7", supportedFormats: ["openai"] },
    { id: "minimax-m2.5", supportedFormats: ["openai"] },
    { id: "glm-5.3-flash", supportedFormats: ["openai"] },
    { id: "glm-5.3", supportedFormats: ["openai"] },
    { id: "glm-5.2", supportedFormats: ["openai"] },
    { id: "glm-5.1", supportedFormats: ["openai"] },
    { id: "glm-5", supportedFormats: ["openai"] },
    { id: "kimi-k2.5", supportedFormats: ["openai"] },
    { id: "kimi-k2.6", supportedFormats: ["openai"] },
    { id: "kimi-k2.7-code", supportedFormats: ["openai"] },
    { id: "kimi-k3", supportedFormats: ["openai"] },
    { id: "big-pickle", supportedFormats: ["openai"] },
    { id: "mimo-v2.5-free", supportedFormats: ["openai"] },
    { id: "ling-3.0-flash-fin-free", supportedFormats: ["openai"] },
    { id: "nemotron-3-ultra-free", supportedFormats: ["openai"] },
    { id: "nemotron-3.5-lightning-free", supportedFormats: ["openai"] },

    // NOT declared: gemini-3.8-flash, 3.7-flash, 3.6-flash, 3.5-flash, 3.5-flash-lite,
    // 3.1-pro, 3-flash — their endpoint is /zen/v1/models/<model-id> (per-model path).
  ],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
