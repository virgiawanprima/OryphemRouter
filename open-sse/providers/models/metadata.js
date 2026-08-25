// Model metadata enrichment layer.
//
// MODEL_METADATA maps a canonical model ID to authentic identity metadata:
//   name          — official model name per the vendor's own docs
//   contextWindow — input context window in tokens (null when unverifiable)
//   vision        — accepts image input
//   reasoning     — is a dedicated reasoning / chain-of-thought model family
//   toolCalling   — supports function/tool calling
//   streaming     — supports token streaming
//   jsonMode      — supports a structured JSON output mode (response_format / json_object)
//
// Values are researched from official vendor docs (OpenAI, Anthropic, Google,
// xAI, DeepSeek, Meta, Mistral, Alibaba Qwen). Where sources conflict or a
// value could not be verified, it is set to null rather than guessed.
//
// This is an enrichment layer only — the registry files under ../registry/
// remain the canonical transport/model source and are untouched.

export const MODEL_METADATA = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  // https://developers.openai.com/api/docs/models
  "gpt-4o": {
    name: "GPT-4o",
    contextWindow: 128000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gpt-4o-mini": {
    name: "GPT-4o mini",
    contextWindow: 128000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "o1": {
    name: "o1",
    contextWindow: 200000,
    vision: true,
    reasoning: true,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "o1-mini": {
    name: "o1-mini",
    contextWindow: 128000,
    vision: false,
    reasoning: true,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "o3": {
    name: "o3",
    contextWindow: 200000,
    vision: true,
    reasoning: true,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "o3-mini": {
    name: "o3-mini",
    contextWindow: 200000,
    vision: false,
    reasoning: true,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gpt-4-turbo": {
    name: "GPT-4 Turbo",
    contextWindow: 128000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gpt-3.5-turbo": {
    name: "GPT-3.5 Turbo",
    contextWindow: 16385,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  // https://docs.anthropic.com/ (Claude 3 / 3.5 family: 200k context, multimodal,
  // tool use + streaming; no OpenAI-style json mode — structured output via tool use)
  "claude-3-5-sonnet-20241022": {
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: false,
  },
  "claude-3-5-haiku-20241022": {
    name: "Claude 3.5 Haiku",
    contextWindow: 200000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: false,
  },
  "claude-3-opus-20240229": {
    name: "Claude 3 Opus",
    contextWindow: 200000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: false,
  },
  "claude-3-sonnet-20240229": {
    name: "Claude 3 Sonnet",
    contextWindow: 200000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: false,
  },
  "claude-3-haiku-20240307": {
    name: "Claude 3 Haiku",
    contextWindow: 200000,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: false,
  },

  // ── Google (Gemini) ───────────────────────────────────────────────────────
  // https://ai.google.dev/gemini-api/docs/models
  "gemini-2.0-flash": {
    name: "Gemini 2.0 Flash",
    contextWindow: 1048576,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gemini-2.0-flash-lite": {
    name: "Gemini 2.0 Flash-Lite",
    contextWindow: 1048576,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gemini-1.5-pro": {
    name: "Gemini 1.5 Pro",
    contextWindow: 2097152,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "gemini-1.5-flash": {
    name: "Gemini 1.5 Flash",
    contextWindow: 1048576,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },

  // ── xAI (Grok) ────────────────────────────────────────────────────────────
  // https://docs.x.ai/ (legacy grok-2/grok-2-mini/grok-beta retired May 2025)
  "grok-2": {
    name: "Grok 2",
    contextWindow: 131072,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  // Context window unverifiable: sources conflict (OpenRouter measures 32,768;
  // early xAI docs listed 131,072) — left null rather than guessed.
  "grok-2-mini": {
    name: "Grok 2 Mini",
    contextWindow: null,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  // Context window unverifiable: launch docs cited 8,192 but the alias was later
  // re-pointed (OpenRouter lists 131,072) — left null rather than guessed.
  "grok-beta": {
    name: "Grok Beta",
    contextWindow: null,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  // https://api-docs.deepseek.com/
  "deepseek-chat": {
    name: "DeepSeek Chat",
    contextWindow: 65536,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  // Legacy DeepSeek Coder API model (text-only, no function calling).
  "deepseek-coder": {
    name: "DeepSeek Coder",
    contextWindow: 16384,
    vision: false,
    reasoning: false,
    toolCalling: false,
    streaming: true,
    jsonMode: false,
  },

  // ── Meta (Llama) ──────────────────────────────────────────────────────────
  // https://ai.meta.com/blog/meta-llama-3-1/ (128k context, native tool calling,
  // JSON output; text-only — vision arrived with Llama 3.2)
  "llama-3.1-405b": {
    name: "Llama 3.1 405B",
    contextWindow: 131072,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "llama-3.1-70b": {
    name: "Llama 3.1 70B",
    contextWindow: 131072,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  "llama-3.1-8b": {
    name: "Llama 3.1 8B",
    contextWindow: 131072,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  // https://docs.mistral.ai/models/
  "mistral-large-latest": {
    name: "Mistral Large",
    contextWindow: 131072,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  // "latest" alias — current generation (Small 3.1+/4) is multimodal with 128k.
  "mistral-small-latest": {
    name: "Mistral Small",
    contextWindow: 131072,
    vision: true,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
  // Classic Mistral Medium (32k context, Jan 2024): text-only, no function
  // calling, no JSON mode.
  "mistral-medium": {
    name: "Mistral Medium",
    contextWindow: 32768,
    vision: false,
    reasoning: false,
    toolCalling: false,
    streaming: true,
    jsonMode: false,
  },

  // ── Alibaba (Qwen) ────────────────────────────────────────────────────────
  // https://huggingface.co/Qwen/Qwen2.5-72B-Instruct (128k context, 8k output)
  "qwen-2.5-72b": {
    name: "Qwen2.5 72B",
    contextWindow: 131072,
    vision: false,
    reasoning: false,
    toolCalling: true,
    streaming: true,
    jsonMode: true,
  },
};
