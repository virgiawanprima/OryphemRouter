// ─────────────────────────────────────────────────────────────────────────────
// KNOWN GAP — this provider's transport is NOT modelled correctly yet.
//
// opencode.ai/docs/zen publishes a per-model endpoint table, and only part of the catalog
// speaks chat. As of 2026-09-16:
//   /zen/v1/responses           all GPT (6-astra … 5-nano), Grok 4.6/4.5, Grok Build 0.1,
//                               Muse Spark 1.3/1.2 (+ contributor-free)
//   /zen/v1/messages            all Claude (fable 5.1/5, opus 5 & 4.x, sonnet 5/4.x,
//                               haiku 4.5), Qwen3.7-Max / 3.7-Plus / 3.6-Plus / 3.5-Plus
//   /zen/v1/models/<model-id>   all Gemini (3.8/3.7/3.6/3.5-flash, 3.5-flash-lite,
//                               3.1-pro, 3-flash) — a PER-MODEL path
//   /zen/v1/chat/completions    DeepSeek, MiniMax, GLM, Kimi, and the free models
//
// Because this entry declares `models: []` and no `transports[]`, chatCore's format pick has
// nothing to work with and the executor sends everything to /chat/completions — so the GPT,
// Claude, Qwen and Gemini models cannot work through this router today.
//
// ⚠️ TRAP: adding `transports[]` WITHOUT a per-model catalog is a REGRESSION, not a fix.
// chatCore falls back to the client's own format when a model declares nothing, so a claude
// client asking for a chat-only model (Kimi, GLM, DeepSeek) would be sent to /messages and
// start failing where it works today.
//
// Minimum viable fix: declare `transports[]` for openai / claude / openai-responses TOGETHER
// WITH per-model `supportedFormats` for the documented (non-Gemini) catalog, and have
// OpenCodeExecutor.buildUrl honour `credentials.runtimeTransport.baseUrl`. Gemini still needs
// a transport shape able to express a per-model path — `{ format, baseUrl }` cannot.
// See Projek/oryphemrouter in the vault for the full table and comparison with the Go provider.
// ─────────────────────────────────────────────────────────────────────────────
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
  models: [],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
