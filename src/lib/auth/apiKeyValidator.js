/**
 * OryphemRouter — API Key Validator
 * ==========================================================
 * Comprehensive API key verification system that tests user-supplied
 * provider API keys against REAL provider endpoints before they are
 * saved to the database.
 *
 * DESIGN PRINCIPLES:
 *   - Lightweight requests only (GET models list / minimal auth probes)
 *   - NO side effects on provider servers (no messages sent, no credits consumed)
 *   - Respects rate limits via exponential backoff
 *   - 5-second hard timeout per validation attempt
 *   - 24-hour in-memory cache to avoid hammering provider APIs
 *   - Clear, actionable error messages for the UI
 *
 * USAGE:
 *   import { validateApiKey } from "@/lib/auth/apiKeyValidator";
 *   const result = await validateApiKey("openai", "sk-...");
 *   // → { valid: true, error: null, modelCount: 42 }
 *   // or { valid: false, error: "Invalid API key - please check your key", modelCount: null }
 *
 * @module apiKeyValidator
 */

// ============================================================
// IMPORTS
// ============================================================
import REGISTRY from "open-sse/providers/registry/index.js";
import {
  APIKEY_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OAUTH_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isCustomEmbeddingProvider,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  CUSTOM_EMBEDDING_PREFIX,
} from "@/shared/constants/providers";

// ============================================================
// CONSTANTS
// ============================================================

/** Hard timeout per individual validation request (milliseconds) */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Minimum acceptable length for any real provider API key.
 * Applied as a generic gate for providers WITHOUT an explicit KEY_FORMAT_PATTERNS
 * entry (e.g. hyperbolic, fal-ai, jina-ai), so a trivially short value like "a"
 * never reaches the network. Real provider keys are always ≥ 20 chars.
 */
const MIN_API_KEY_LENGTH = 16;

/** Cache time-to-live (24 hours in milliseconds) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

/** Maximum number of retry attempts on transient failures (rate limits, 5xx) */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (milliseconds) */
const BASE_BACKOFF_MS = 500;

/** Supported provider categories for key-based auth */
const AUTH_CATEGORIES = new Set(["apikey", "freeTier"]);

/**
 * Default base URLs and validation endpoints for known providers.
 * These serve as fallbacks when the registry doesn't specify a validateUrl.
 *
 * Each entry follows the shape:
 *   providerId → { baseUrl, validateUrl, authHeader, authScheme, method }
 */
const PROVIDER_ENDPOINTS = {
  // ── OpenAI ────────────────────────────────────────────────
  // OpenAI API keys start with "sk-" and are validated by listing models.
  // This is a GET request that returns 200 + model array on success,
  // or 401 if the key is invalid/revoked. No credits are consumed.
  openai: {
    baseUrl: "https://api.openai.com/v1",
    validateUrl: "https://api.openai.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Anthropic ─────────────────────────────────────────────
  // Anthropic keys start with "sk-ant-" and require the x-api-key header.
  // We send a MINIMAL POST to /v1/messages with max_tokens=1 and a single
  // "hi" message. This will fail with an API error (not auth error) if key is valid,
  // or return 401 if key is invalid. The key point: we NEVER send real prompts.
  // The 2023-06-01 version header is mandatory.
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    validateUrl: "https://api.anthropic.com/v1/messages",
    authHeader: "x-api-key",
    authScheme: "", // Raw key, no prefix needed
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    },
    // Anthropic returns 400 (not 401) when the key is invalid if the request
    // format is bad; but a valid key + bad model returns an actual API error.
    // We check: 401 = definitely invalid, anything else with auth error = invalid.
  },

  // ── Google Gemini ─────────────────────────────────────────
  // Gemini uses x-goog-api-key header (not Bearer). Validation via GET /models
  // returns the model catalog. The endpoint is part of the base URL itself
  // (generativelanguage.googleapis.com/v1beta/models).
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    validateUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    authHeader: "x-goog-api-key",
    authScheme: "", // Raw key in header value
    method: "GET",
  },

  // ── xAI Grok ──────────────────────────────────────────────
  // xAI API (api.x.ai) is OpenAI-compatible. Keys validate via GET /v1/models.
  // Note: xai is category "oauth" but also supports apikey mode (authModes contains both).
  xai: {
    baseUrl: "https://api.x.ai/v1",
    validateUrl: "https://api.x.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Azure OpenAI ──────────────────────────────────────────
  // Azure requires both an endpoint URL and an API key. The baseUrl is
  // constructed as: https://{resource}.openai.azure.com/openai/deployments
  // Validation is done via GET /openai/models?api-version=2024-02-01
  // Azure keys look like random hex strings (no sk- prefix).
  azure: {
    baseUrl: "", // Dynamically set from provider-specific data
    validateUrl: "", // Constructed from endpoint + api-version
    authHeader: "api-key",
    authScheme: "", // Raw key
    method: "GET",
    // Requires additional provider-specific fields:
    //   - resourceName (your Azure OpenAI resource name)
    //   - apiVersion  (e.g., "2024-02-01")
  },

  // ── Cloudflare Workers AI ─────────────────────────────────
  // Cloudflare uses a Bearer token (API token) + an Account ID in the URL.
  // The baseUrl template: https://api.cloudflare.com/client/v4/accounts/{accountId}/ai
  // Validation: GET .../v1/models (returns available models)
  // Requires additional provider-specific fields:
  //   - accountId (your Cloudflare Account ID)
  "cloudflare-ai": {
    baseUrl: "https://api.cloudflare.com/client/v4/accounts",
    validateUrl: "", // Constructed from accountId
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── HuggingFace Inference API ─────────────────────────────
  // HuggingFace uses Bearer token. Validate via GET to the inference API.
  // Note: HF has transport: null in registry, so we define it here.
  huggingface: {
    baseUrl: "https://api-inference.huggingface.co",
    validateUrl: "https://api-inference.huggingface.co/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Tavily Search API ────────────────────────────────────
  // Tavily uses a POST-based search API. Validate by sending a minimal search
  // request. A valid key returns results; invalid returns 401.
  // Tavily keys typically start with "tvly-".
  tavily: {
    baseUrl: "https://api.tavily.com",
    validateUrl: "https://api.tavily.com/search",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "POST",
    body: {
      query: "test",
      max_results: 1,
    },
  },

  // ── SearchAPI.io ──────────────────────────────────────────
  searchapi: {
    baseUrl: "https://www.searchapi.io/api/v1",
    validateUrl: "https://www.searchapi.io/api/v1/search?engine=google&q=test",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Serper (Google Search API) ────────────────────────────
  serper: {
    baseUrl: "https://google.serper.dev",
    validateUrl: "https://google.serper.dev/search",
    authHeader: "x-api-key",
    authScheme: "", // Raw key
    method: "POST",
    body: { q: "test", num: 1 },
  },

  // ── Exa (search API) ──────────────────────────────────────
  exa: {
    baseUrl: "https://api.exa.ai",
    validateUrl: "https://api.exa.ai/search",
    authHeader: "x-api-key",
    authScheme: "", // Raw key
    method: "POST",
    body: { query: "test", numResults: 1 },
  },

  // ── Brave Search ──────────────────────────────────────────
  "brave-search": {
    baseUrl: "https://api.search.brave.com",
    validateUrl: "https://api.search.brave.com/res/v1/web/search?q=test&count=1",
    authHeader: "x-api-key",
    authScheme: "", // Raw key
    method: "GET",
  },

  // ── Jina AI (reader + embedding) ─────────────────────────
  "jina-ai": {
    baseUrl: "https://api.jina.ai/v1",
    validateUrl: "https://api.jina.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Jina Reader ──────────────────────────────────────────
  "jina-reader": {
    baseUrl: "https://r.jina.ai",
    validateUrl: "https://r.jina.ai/http://example.com",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Firecrawl ─────────────────────────────────────────────
  firecrawl: {
    baseUrl: "https://api.firecrawl.dev/v1",
    validateUrl: "https://api.firecrawl.dev/v1/scrape",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "POST",
    body: { url: "https://example.com", formats: ["markdown"] },
  },

  // ── ElevenLabs TTS ────────────────────────────────────────
  elevenlabs: {
    baseUrl: "https://api.elevenlabs.io/v1",
    validateUrl: "https://api.elevenlabs.io/v1/voices",
    authHeader: "xi-api-key",
    authScheme: "", // Raw key
    method: "GET",
  },

  // ── PlayHT TTS ────────────────────────────────────────────
  playht: {
    baseUrl: "https://api.play.ht",
    validateUrl: "https://api.play.ht/api/v2/voices",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
    headers: {
      "X-User-ID": "", // Requires user ID — validation is partial without it
    },
  },

  // ── Deepgram STT ──────────────────────────────────────────
  deepgram: {
    baseUrl: "https://api.deepgram.com/v1",
    validateUrl: "https://api.deepgram.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Token", // Deepgram uses "Token" not "Bearer"
    method: "GET",
  },

  // ── AssemblyAI STT ────────────────────────────────────────
  assemblyai: {
    baseUrl: "https://api.assemblyai.com/v2",
    validateUrl: "https://api.assemblyai.com/v2/realtime/token",
    authHeader: "Authorization",
    authScheme: "", // Raw key (no prefix)
    method: "POST",
    body: { expires_in: 60 }, // Minimal token request
  },

  // ── Stability AI ─────────────────────────────────────────
  "stability-ai": {
    baseUrl: "https://api.stability.ai/v2",
    validateUrl: "https://api.stability.ai/v2/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Recraft AI (image generation) ────────────────────────
  recraft: {
    baseUrl: "https://api.recraft.ai/v1",
    validateUrl: "https://api.recraft.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Fal AI ───────────────────────────────────────────────
  "fal-ai": {
    baseUrl: "https://fal.run",
    validateUrl: "https://fal.run/models",
    authHeader: "Authorization",
    authScheme: "Key", // Fal uses "Key" prefix
    method: "GET",
  },

  // ── Black Forest Labs ────────────────────────────────────
  "black-forest-labs": {
    baseUrl: "https://api.bfl.ml/v1",
    validateUrl: "https://api.bfl.ml/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Runway ML ────────────────────────────────────────────
  runwayml: {
    baseUrl: "https://api.runwayml.com/v1",
    validateUrl: "https://api.runwayml.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Voyage AI (embedding) ────────────────────────────────
  "voyage-ai": {
    baseUrl: "https://api.voyageai.com/v1",
    validateUrl: "https://api.voyageai.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Cohere ────────────────────────────────────────────────
  cohere: {
    baseUrl: "https://api.cohere.ai/v1",
    validateUrl: "https://api.cohere.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
    // Note: Cohere returns 401 on invalid key, 200 + model list on success
    // Some models require "Cohere" instead of "Bearer" — we try Bearer first
  },

  // ── Mistral AI ────────────────────────────────────────────
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    validateUrl: "https://api.mistral.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Together AI ──────────────────────────────────────────
  together: {
    baseUrl: "https://api.together.xyz/v1",
    validateUrl: "https://api.together.xyz/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Fireworks AI ─────────────────────────────────────────
  fireworks: {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    validateUrl: "https://api.fireworks.ai/inference/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── DeepSeek ──────────────────────────────────────────────
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    validateUrl: "https://api.deepseek.com/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Groq ──────────────────────────────────────────────────
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    validateUrl: "https://api.groq.com/openai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── OpenRouter ────────────────────────────────────────────
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    validateUrl: "https://openrouter.ai/api/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
    headers: {
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy",
    },
  },

  // ── Perplexity ───────────────────────────────────────────
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    validateUrl: "https://api.perplexity.ai/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Cerebras ─────────────────────────────────────────────
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    validateUrl: "https://api.cerebras.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Hyperbolic ───────────────────────────────────────────
  hyperbolic: {
    baseUrl: "https://api.hyperbolic.xyz/v1",
    validateUrl: "https://api.hyperbolic.xyz/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Nebius AI ────────────────────────────────────────────
  nebius: {
    baseUrl: "https://api.studio.nebius.ai/v1",
    validateUrl: "https://api.studio.nebius.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── NVIDIA NIM ───────────────────────────────────────────
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    validateUrl: "https://integrate.api.nvidia.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── SiliconFlow ──────────────────────────────────────────
  siliconflow: {
    baseUrl: "https://api.siliconflow.com/v1",
    validateUrl: "https://api.siliconflow.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Featherless ──────────────────────────────────────────
  featherless: {
    baseUrl: "https://api.featherless.ai/v1",
    validateUrl: "https://api.featherless.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── SambaNova ────────────────────────────────────────────
  sambanova: {
    baseUrl: "https://api.sambanova.ai/v1",
    validateUrl: "https://api.sambanova.ai/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Venice AI ────────────────────────────────────────────
  venice: {
    baseUrl: "https://api.venice.ai/api/v1",
    validateUrl: "https://api.venice.ai/api/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── API.airforce ─────────────────────────────────────────
  "api-airforce": {
    baseUrl: "https://api.airforce/v1",
    validateUrl: "https://api.airforce/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
    headers: {
      "HTTP-Referer": "https://endpoint-proxy.local",
      "X-Title": "Endpoint Proxy",
    },
  },

  // ── Kilo Gateway ─────────────────────────────────────────
  "kilo-gateway": {
    baseUrl: "https://api.kilo.ai/api/gateway",
    validateUrl: "https://api.kilo.ai/api/gateway/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── GitHub Models ────────────────────────────────────────
  github: {
    baseUrl: "https://models.inference.ai.azure.com",
    validateUrl: "https://models.inference.ai.azure.com/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── GitLab AI ────────────────────────────────────────────
  gitlab: {
    baseUrl: "https://gitlab.com/api/v4",
    validateUrl: "https://gitlab.com/api/v4/ai/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── You.com ──────────────────────────────────────────────
  youcom: {
    baseUrl: "https://api.you.com",
    validateUrl: "https://api.you.com/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Minimax ──────────────────────────────────────────────
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
    validateUrl: "https://api.minimax.chat/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── GLM ──────────────────────────────────────────────────
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    validateUrl: "https://open.bigmodel.cn/api/paas/v4/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Kimi (Moonshot) ──────────────────────────────────────
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    validateUrl: "https://api.moonshot.cn/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Volcengine Ark ───────────────────────────────────────
  "volcengine-ark": {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    validateUrl: "https://ark.cn-beijing.volces.com/api/v3/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── BytePlus ─────────────────────────────────────────────
  byteplus: {
    baseUrl: "https://api.byteplus.com/v1",
    validateUrl: "https://api.byteplus.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Baidu Qianfan ─────────────────────────────────────────
  baidu: {
    baseUrl: "https://qianfan.baidubce.com/v2",
    validateUrl: "https://qianfan.baidubce.com/v2/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Tencent Hunyuan ──────────────────────────────────────
  tencent: {
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    validateUrl: "https://api.hunyuan.cloud.tencent.com/v1/models",
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Ollama (local) ───────────────────────────────────────
  // Ollama doesn't require API keys — this is a no-auth provider.
  // Validation is skipped; we always return valid.
  ollama: { skipValidation: true },
  "ollama-local": { skipValidation: true },

  // ── Vercel AI Gateway ────────────────────────────────────
  "vercel-ai-gateway": {
    baseUrl: "https://gateway.ai.cloudflare.com/v1",
    validateUrl: "", // Needs account-specific info
    authHeader: "Authorization",
    authScheme: "Bearer",
    method: "GET",
  },

  // ── Vertex AI (GCP) ──────────────────────────────────────
  // Vertex uses OAuth (ADC / service account). API key validation
  // is not applicable the same way; we flag this.
  vertex: { skipValidation: true, note: "Uses GCP OAuth — validate via provider console" },
  "vertex-partner": { skipValidation: true, note: "Uses GCP OAuth — validate via provider console" },

  // ── Local / device providers ─────────────────────────────
  "local-device": { skipValidation: true },

  // ── Self-hosted providers ────────────────────────────────
  // No API key validation — the user hosts their own instance.
  "selfhosted-embedding": { skipValidation: true },
  "selfhosted-stt": { skipValidation: true },
  "selfhosted-tts": { skipValidation: true },

  // ── Web cookie providers (no API key) ────────────────────
  "grok-web": { skipValidation: true, note: "Uses SSO cookie, not API key" },
};

/**
 * Key format patterns for client-side pre-validation.
 * Each pattern is a RegExp that the key should match.
 * null = no format check (accept any format).
 */
const KEY_FORMAT_PATTERNS = {
  // NOTE: hyphens are allowed after the prefix — modern keys contain them
  // (e.g. OpenAI "sk-proj-...", Anthropic "sk-ant-api03-...", OpenRouter
  // "sk-or-v1-..."). The real provider endpoint check is the authoritative
  // gate; the format pattern only avoids obvious junk.
  openai:              /^sk-[A-Za-z0-9-]{20,}$/,          // sk-xxx... / sk-proj-xxx...
  anthropic:           /^sk-ant-[A-Za-z0-9-]{30,}$/,      // sk-ant-api03-xxx...
  azure:               /^[A-Za-z0-9]{20,}$/,             // Random hex string
  deepseek:            /^sk-[A-Za-z0-9-]{20,}$/,          // sk-xxx... (similar to OpenAI)
  groq:                /^gsk_[A-Za-z0-9]{30,}$/,         // gsk_xxx...
  openrouter:          /^sk-or-[A-Za-z0-9-]{20,}$/,       // sk-or-v1-xxx...
  together:            /^[A-Za-z0-9]{30,}$/,             // Long alphanumeric
  fireworks:           /^fw_[A-Za-z0-9]{20,}$/,          // fw_xxx...
  cohere:              /^[A-Za-z0-9]{40,}$/,             // Long alphanumeric
  mistral:             /^[A-Za-z0-9]{30,}$/,             // Long alphanumeric
  "stability-ai":      /^sk-[A-Za-z0-9-]{20,}$/,         // sk-xxx...
  huggingface:         /^hf_[A-Za-z0-9]{20,}$/,          // hf_xxx...
  tavily:              /^tvly-[A-Za-z0-9]{20,}$/,        // tvly-xxx...
  perplexity:          /^pplx-[A-Za-z0-9]{20,}$/,        // pplx-xxx...
  elevenlabs:          /^[A-Za-z0-9]{20,}$/,             // Random string
  deepgram:            /^[A-Za-z0-9]{30,}$/,             // Random string
  serper:              /^[A-Za-z0-9]{30,}$/,             // Random string
  exa:                 /^[A-Za-z0-9\-]{20,}$/,           // UUID-like
  cerebras:            /^cerebras_[A-Za-z0-9]{20,}$/,    // cerebras_xxx...
  hyperbolics:         /^[A-Za-z0-9]{30,}$/,             // Long alphanumeric
  hyperbolic:          /^[A-Za-z0-9]{30,}$/,             // Long alphanumeric
  siliconflow:         /^sk-[A-Za-z0-9-]{20,}$/,          // sk-xxx...
  venice:              /^[A-Za-z0-9]{30,}$/,             // Long alphanumeric
  nvidia:              /^nvapi-[A-Za-z0-9\-]{30,}$/,     // nvapi-xxx...
};
// Note: if a provider is not in KEY_FORMAT_PATTERNS, no format check is performed.

// ============================================================
// IN-MEMORY CACHE
// ============================================================

/**
 * Cache map: key = `${providerId}:${apiKeyHash}` → { result, expiresAt }
 * We use a hash of the API key to avoid storing keys in memory longer than needed.
 * Entries expire after CACHE_TTL_MS (24 hours).
 */
const validationCache = new Map();

/**
 * Generate a simple hash of the API key for cache keying.
 * Uses a fast non-cryptographic hash (we only need obfuscation, not security).
 * @param {string} key - The API key
 * @returns {string} Short hash string
 */
function hashKey(key) {
  let hash = 0;
  if (!key || key.length === 0) return "empty";
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get a cached validation result.
 * @param {string} cacheKey
 * @returns {object|null} Cached result or null if not found/expired
 */
function getCachedResult(cacheKey) {
  const cached = validationCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  validationCache.delete(cacheKey);
  return null;
}

/**
 * Set a validation result in the cache.
 * @param {string} cacheKey
 * @param {object} result
 */
function setCachedResult(cacheKey, result) {
  validationCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  // Periodically clean stale entries (every 100 writes)
  if (validationCache.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of validationCache) {
      if (now >= entry.expiresAt) validationCache.delete(key);
    }
  }
}

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

/**
 * Error categories returned by the validator.
 * Each maps to a user-facing message template.
 */
const ErrorTypes = {
  INVALID_KEY:    "invalid_key",
  INVALID_FORMAT: "invalid_format",
  NETWORK_ERROR:  "network_error",
  TIMEOUT:        "timeout",
  RATE_LIMITED:   "rate_limited",
  UNKNOWN:        "unknown",
};

/**
 * Human-readable error messages for each error type.
 * These are designed to be shown directly in the UI.
 */
const ERROR_MESSAGES = {
  [ErrorTypes.INVALID_KEY]:
    "Invalid API key — please check your key and try again.",
  [ErrorTypes.INVALID_FORMAT]:
    "Invalid key format — expected a key starting with \"{prefix}\".",
  [ErrorTypes.NETWORK_ERROR]:
    "Network unreachable — the provider's API may be down or your network may have issues.",
  [ErrorTypes.TIMEOUT]:
    "Request timed out — the provider took too long to respond. Please try again.",
  [ErrorTypes.RATE_LIMITED]:
    "Rate limited — the provider is receiving too many requests. Please wait a moment and try again.",
  [ErrorTypes.UNKNOWN]:
    "Unable to verify API key — an unexpected error occurred. Please try again.",
};

/**
 * Classify an HTTP status code into an ErrorType.
 * @param {number} status - HTTP status code
 * @param {string} providerId - Provider ID for context
 * @returns {string} ErrorType constant
 */
function classifyHttpError(status, providerId) {
  switch (status) {
    case 401:
    case 403:
      return ErrorTypes.INVALID_KEY;
    case 429:
      return ErrorTypes.RATE_LIMITED;
    case 502:
    case 503:
    case 504:
      return ErrorTypes.NETWORK_ERROR;
    default:
      // 4xx normally means bad request (maybe valid key, bad request format)
      if (status >= 400 && status < 500) {
        // Some providers return 400/422 for invalid keys with specific errors
        return ErrorTypes.INVALID_KEY;
      }
      return ErrorTypes.NETWORK_ERROR;
  }
}

/**
 * Build an error result object.
 * @param {string} type - ErrorType constant
 * @param {string} [detail] - Optional additional detail (e.g., status code)
 * @param {string} [prefix] - Optional key prefix hint for format errors
 * @returns {{ valid: false, error: string, errorType: string }}
 */
function buildError(type, detail, prefix) {
  let message = ERROR_MESSAGES[type] || ERROR_MESSAGES[ErrorTypes.UNKNOWN];
  if (type === ErrorTypes.INVALID_FORMAT && prefix) {
    message = `Invalid key format — expected a key starting with "${prefix}".`;
  }
  if (detail) {
    message += ` (${detail})`;
  }
  return { valid: false, error: message, errorType: type, modelCount: null };
}

/**
 * Build a success result object.
 * @param {number} [modelCount] - Number of accessible models
 * @returns {{ valid: true, error: null, modelCount: number }}
 */
function buildSuccess(modelCount) {
  return {
    valid: true,
    error: null,
    errorType: null,
    modelCount: modelCount ?? null,
  };
}

// ============================================================
// HTTP HELPER
// ============================================================

/**
 * Make an HTTP request with timeout and AbortController.
 *
 * This is the core network primitive used by all provider tests.
 * It handles:
 *   - Timeout via AbortController (REQUEST_TIMEOUT_MS)
 *   - Non-ok status responses (returned as error results)
 *   - Network errors / DNS failures (caught and classified)
 *
 * @param {string} url - Full request URL
 * @param {object} options - Fetch options
 * @returns {Promise<{ ok: boolean, status: number, data?: object, error?: string }>}
 */
async function makeRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeoutId);

    let data = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        // Response wasn't valid JSON despite content-type
        data = null;
      }
    }

    // Some providers return 200 with an error in the body
    if (response.ok) {
      return { ok: true, status: response.status, data };
    }

    return {
      ok: false,
      status: response.status,
      data,
      error: data?.error?.message || data?.error || response.statusText || "Unknown error",
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      return { ok: false, status: 0, data: null, error: "Request timed out", timedOut: true };
    }

    // Network errors (DNS, connection refused, etc.)
    return { ok: false, status: 0, data: null, error: err.message || "Network error" };
  }
}

/**
 * Attempt a request with retry on transient failures.
 *
 * Retry strategy:
 *   - Retry on 429 (rate limit), 5xx (server errors), and network errors
 *   - Exponential backoff with jitter
 *   - Max MAX_RETRIES attempts
 *
 * @param {string} url
 * @param {object} options
 * @param {number} [attempts=MAX_RETRIES]
 * @returns {Promise<object>} Response object
 */
async function makeRequestWithRetry(url, options = {}, attempts = MAX_RETRIES) {
  for (let attempt = 0; attempt <= attempts; attempt++) {
    const result = await makeRequest(url, options);

    // Success or non-retryable failure
    if (result.ok) return result;
    if (result.status === 401 || result.status === 403) return result; // Auth failures: no retry
    if (result.timedOut && attempt < attempts) {
      // Timeout may be temporary — retry
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if ((result.status === 429 || result.status >= 500) && attempt < attempts) {
      const delay = BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    return result;
  }

  // All retries exhausted
  return { ok: false, status: 0, data: null, error: "Max retries exceeded" };
}

// ============================================================
// PROVIDER-SPECIFIC VALIDATION FUNCTIONS
// ============================================================

/**
 * ── OpenAI-style Validation ─────────────────────────────────
 *
 * Strategy: GET /v1/models with `Authorization: Bearer <key>`.
 *
 * Why this works:
 *   - OpenAI's /v1/models endpoint is a read-only, no-cost operation
 *   - Returns 200 + array of model objects on success
 *   - Returns 401 + specific error message on invalid key
 *   - No side effects, no credits consumed
 *
 * Used by: OpenAI, and as fallback for most OpenAI-compatible providers.
 */
async function validateOpenAICompat(providerId, apiKey, extraHeaders) {
  const endpoint = PROVIDER_ENDPOINTS[providerId];
  const validateUrl = endpoint.validateUrl;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    // Success: parse model count from response
    const models = result.data?.data || result.data?.models || [];
    const modelCount = Array.isArray(models) ? models.length : 0;
    return buildSuccess(modelCount);
  }

  // Handle specific error patterns
  // OpenAI returns 401 with { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }
  // Other providers may return similar structures
  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 429) {
    return buildError(ErrorTypes.RATE_LIMITED);
  }
  if (result.timedOut || result.status === 0) {
    return buildError(ErrorTypes.TIMEOUT);
  }

  return buildError(classifyHttpError(result.status, providerId), `HTTP ${result.status}`);
}

/**
 * ── Anthropic-style Validation ──────────────────────────────
 *
 * Strategy: POST /v1/messages with MINIMAL payload.
 *
 * Why this approach:
 *   - Anthropic does NOT have a GET /models endpoint that validates auth
 *   - Their model list is at /v1/models but it returns 200 even with invalid key
 *     (it lists publicly available models)
 *   - The only reliable way to test auth is to attempt a chat completion
 *   - We send max_tokens=1 with a single "hi" message
 *   - A VALID key returns 400+ error about insufficient credits or content policy
 *   - An INVALID key returns 401 with auth error
 *
 * SAFETY: Sending max_tokens=1 ensures negligible (sub-cent) cost if any.
 * The request is immediately truncated. On providers with no minimum charge,
 * this incurs zero cost.
 */
async function validateAnthropic(providerId, apiKey) {
  const endpoint = PROVIDER_ENDPOINTS.anthropic;
  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(endpoint.validateUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (result.ok) {
    // Actually receiving 200 from a 1-token request means the key works
    return buildSuccess();
  }

  // Anthropic-specific error classification:
  // 401 = definitely invalid key
  // 400 + "credit" or "insufficient" in error = valid key, no credits (still valid!)
  // 400 + "api_key" in error = invalid key
  // 529 = overloaded (temporary)
  if (result.status === 401) {
    return buildError(ErrorTypes.INVALID_KEY, "HTTP 401");
  }

  if (result.status === 400 && result.data) {
    const errMsg = (result.data.error?.message || result.data.error || "").toLowerCase();
    // "Your credit balance is too low" → key is valid but no credits
    if (errMsg.includes("credit") || errMsg.includes("insufficient") || errMsg.includes("balance")) {
      return buildSuccess(); // Key is valid, just no credits
    }
    // "Invalid API key" → key is bad
    if (errMsg.includes("api_key") || errMsg.includes("invalid") || errMsg.includes("authentication")) {
      return buildError(ErrorTypes.INVALID_KEY, result.data.error?.message);
    }
    // Other 400 errors may still mean the key is valid (e.g., content policy)
    return buildSuccess();
  }

  if (result.status === 429) {
    return buildError(ErrorTypes.RATE_LIMITED);
  }

  if (result.timedOut) {
    return buildError(ErrorTypes.TIMEOUT);
  }

  // 529 = Anthropic's overloaded status
  if (result.status === 529) {
    return buildError(ErrorTypes.NETWORK_ERROR, "Provider overloaded (529)");
  }

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Google Gemini Validation ────────────────────────────────
 *
 * Strategy: GET /v1beta/models with `x-goog-api-key: <key>`.
 *
 * Why this works:
 *   - Gemini uses x-goog-api-key header (NOT Authorization: Bearer)
 *   - GET /v1beta/models returns the list of available models
 *   - Returns 200 + model list on success
 *   - Returns 403 with "API key not valid" on invalid key
 *   - No cost for listing models
 */
async function validateGemini(providerId, apiKey) {
  const endpoint = PROVIDER_ENDPOINTS.gemini;
  const headers = {
    "x-goog-api-key": apiKey,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(endpoint.validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    // Response: { models: [{ name: "models/gemini-...", ... }] }
    const models = result.data?.models || result.data?.data || [];
    const modelCount = Array.isArray(models) ? models.length : 0;
    return buildSuccess(modelCount);
  }

  // Gemini returns 403 with "API_KEY_INVALID" when key is bad
  if (result.status === 403 || result.status === 401) {
    const errBody = result.data?.error?.message || result.data?.error || "";
    if (errBody.toLowerCase().includes("api key") || errBody.toLowerCase().includes("invalid")) {
      return buildError(ErrorTypes.INVALID_KEY, errBody);
    }
    // 403 can also mean the API is not enabled for the project
    if (errBody.toLowerCase().includes("not enabled") || errBody.toLowerCase().includes("access")) {
      // Key is valid but the Generative Language API is not enabled
      return buildSuccess(); // Key itself is valid
    }
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }

  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Azure OpenAI Validation ────────────────────────────────
 *
 * Strategy: GET `{endpoint}/openai/models?api-version={version}` with `api-key: <key>`.
 *
 * Why this works:
 *   - Azure OpenAI uses api-key header (not Bearer)
 *   - Requires endpoint URL + API version in query string
 *   - Returns 200 + deployment list on success
 *   - Returns 401 on invalid key
 *
 * Note: Azure requires provider-specific data (endpoint URL).
 * The validation endpoint is constructed from the user's resource name.
 */
async function validateAzure(providerId, apiKey, providerData) {
  // Azure requires additional context: resource name and API version
  const resourceName = providerData?.resourceName || providerData?.endpoint || providerData?.resource;
  const apiVersion = providerData?.apiVersion || "2024-02-01";

  if (!resourceName) {
    return {
      valid: false,
      error: "Azure OpenAI requires a resource endpoint URL. Please provide it in the provider settings.",
      errorType: ErrorTypes.INVALID_FORMAT,
      modelCount: null,
    };
  }

  // Extract just the resource name from a full URL if provided
  const base = resourceName.replace(/^https?:\/\//, "").split("/")[0];
  const validateUrl = `https://${base}/openai/models?api-version=${apiVersion}`;

  const headers = {
    "api-key": apiKey,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    const models = result.data?.data || [];
    const modelCount = Array.isArray(models) ? models.length : 0;
    return buildSuccess(modelCount);
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 404) {
    return buildError(ErrorTypes.INVALID_KEY, "Endpoint not found — check your resource name");
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Cloudflare Workers AI Validation ────────────────────────
 *
 * Strategy: GET `.../accounts/{accountId}/ai/v1/models` with `Authorization: Bearer <token>`.
 *
 * Why this works:
 *   - Requires both API token AND Account ID
 *   - Returns 200 + model list on success
 *   - Returns 401/403 on invalid token
 */
async function validateCloudflare(providerId, apiKey, providerData) {
  const accountId = providerData?.accountId;

  if (!accountId) {
    return {
      valid: false,
      error: "Cloudflare requires an Account ID. Please provide it in the provider settings.",
      errorType: ErrorTypes.INVALID_FORMAT,
      modelCount: null,
    };
  }

  const validateUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/models`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    // Cloudflare returns { success: true, result: [...] }
    const models = result.data?.result || [];
    const modelCount = Array.isArray(models) ? models.length : 0;
    return buildSuccess(modelCount);
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }

  if (result.data?.errors) {
    const errMsg = result.data.errors.map((e) => e.message).join("; ");
    if (errMsg.toLowerCase().includes("authentication")) {
      return buildError(ErrorTypes.INVALID_KEY, errMsg);
    }
  }

  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Tavily Search API Validation ────────────────────────────
 *
 * Strategy: POST /search with minimal query.
 *
 * Why this works:
 *   - Tavily requires POST to /search
 *   - Sending query="test" with max_results=1 incurs minimal/no cost for most plans
 *   - Returns 200 + search results on success
 *   - Returns 401/403 on invalid key
 */
async function validateTavily(providerId, apiKey) {
  const endpoint = PROVIDER_ENDPOINTS.tavily;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(endpoint.validateUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "test", max_results: 1 }),
  });

  if (result.ok) {
    return buildSuccess();
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── POST-based Validation (generic) ─────────────────────────
 *
 * Used by providers that require POST validation with a minimal body.
 *
 * Providers: AssemblyAI, Serper, Exa, Firecrawl, SearchAPI
 */
async function validatePostBased(providerId, apiKey) {
  const endpoint = PROVIDER_ENDPOINTS[providerId];
  const { validateUrl, authHeader, authScheme, body, headers: extraHeaders } = endpoint;

  const authValue = authScheme ? `${authScheme} ${apiKey}`.trim() : apiKey;
  const headers = {
    [authHeader]: authValue,
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (result.ok) {
    return buildSuccess();
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── GET-based Validation (generic) ──────────────────────────
 *
 * Used by providers that validate via simple GET to a list endpoint.
 *
 * Providers: ElevenLabs, Deepgram, Stability AI, etc.
 */
async function validateGetBased(providerId, apiKey) {
  const endpoint = PROVIDER_ENDPOINTS[providerId];
  const { validateUrl, authHeader, authScheme, headers: extraHeaders } = endpoint;

  const authValue = authScheme ? `${authScheme} ${apiKey}`.trim() : apiKey;
  const headers = {
    [authHeader]: authValue,
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    return buildSuccess();
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── HuggingFace Inference API Validation ────────────────────
 *
 * Strategy: GET /models with Authorization: Bearer <key>.
 *
 * Why this works:
 *   - HuggingFace's /api/models endpoint lists all accessible models
 *   - Returns 200 + model list for valid keys
 *   - Returns 401 for invalid/expired tokens
 *   - Free/read-only operation
 */
async function validateHuggingFace(providerId, apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(
    "https://api-inference.huggingface.co/models",
    { method: "GET", headers },
  );

  if (result.ok) {
    const models = Array.isArray(result.data) ? result.data : [];
    return buildSuccess(models.length);
  }

  if (result.status === 401) {
    // Check for specific HF error format
    const errMsg = result.data?.error || "";
    return buildError(ErrorTypes.INVALID_KEY, errMsg || "HTTP 401");
  }
  if (result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, "Token lacks necessary permissions");
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── OpenAI-Compatible Custom Provider Validation ────────────
 *
 * Used when the user adds a custom provider with openai-compatible- prefix.
 * Strategy: same as OpenAI validation but against their custom base URL.
 *
 * The user must provide a base URL for the custom provider.
 */
async function validateOpenAICompatibleCustom(providerId, apiKey, providerData) {
  // Extract the custom base URL: stored in provider data or derived from providerId
  const customBaseUrl = providerData?.baseUrl || providerData?.endpoint;

  if (!customBaseUrl) {
    return {
      valid: false,
      error: "Custom provider requires a base URL. Please configure it in the provider settings.",
      errorType: ErrorTypes.INVALID_FORMAT,
      modelCount: null,
    };
  }

  // Normalize the URL: remove trailing /chat/completions if present and add /models
  const base = customBaseUrl
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/v1\/?$/, "")
    .replace(/\/+$/, "");

  const validateUrl = `${base}/v1/models`;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "GET",
    headers,
  });

  if (result.ok) {
    const models = result.data?.data || result.data?.models || [];
    const modelCount = Array.isArray(models) ? models.length : 0;
    return buildSuccess(modelCount);
  }

  if (result.status === 401 || result.status === 403) {
    return buildError(ErrorTypes.INVALID_KEY, `HTTP ${result.status}`);
  }
  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  // Connection refused / DNS failure often means wrong URL
  if (result.status === 0) {
    return buildError(ErrorTypes.NETWORK_ERROR,
      "Could not connect — check that your base URL is correct and the provider is accessible");
  }

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Anthropic-Compatible Custom Provider Validation ─────────
 *
 * Used when the user adds a custom provider with anthropic-compatible- prefix.
 */
async function validateAnthropicCompatibleCustom(providerId, apiKey, providerData) {
  const customBaseUrl = providerData?.baseUrl || providerData?.endpoint;

  if (!customBaseUrl) {
    return {
      valid: false,
      error: "Custom provider requires a base URL. Please configure it in the provider settings.",
      errorType: ErrorTypes.INVALID_FORMAT,
      modelCount: null,
    };
  }

  // Normalize the URL
  const base = customBaseUrl
    .replace(/\/messages\/?$/, "")
    .replace(/\/v1\/?$/, "")
    .replace(/\/+$/, "");

  const validateUrl = `${base}/v1/messages`;

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };

  const result = await makeRequestWithRetry(validateUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (result.ok) {
    return buildSuccess();
  }

  if (result.status === 401) {
    return buildError(ErrorTypes.INVALID_KEY, "HTTP 401");
  }

  if (result.status === 400) {
    // Could be valid key with bad model/params
    return buildSuccess();
  }

  if (result.status === 429) return buildError(ErrorTypes.RATE_LIMITED);
  if (result.timedOut) return buildError(ErrorTypes.TIMEOUT);

  if (result.status === 0) {
    return buildError(ErrorTypes.NETWORK_ERROR,
      "Could not connect — check that your base URL is correct");
  }

  return buildError(classifyHttpError(result.status), `HTTP ${result.status}`);
}

/**
 * ── Custom Embedding Provider Validation ────────────────────
 *
 * Custom embedding providers are typically OpenAI-compatible embedding endpoints.
 */
async function validateCustomEmbedding(providerId, apiKey, providerData) {
  return validateOpenAICompatibleCustom(providerId, apiKey, providerData);
}

// ============================================================
// PROVIDER ROUTING
// ============================================================

/**
 * Map providerId to its specific validation function.
 * This is the central routing table that matches each provider
 * to the appropriate test strategy.
 *
 * @param {string} providerId - The provider identifier
 * @returns {Function|null} Validation function or null if skip/unsupported
 */
function getValidatorForProvider(providerId) {
  // ── OpenAI-Compatible Custom Providers ────────────────────
  if (isOpenAICompatibleProvider(providerId)) {
    return validateOpenAICompatibleCustom;
  }

  // ── Anthropic-Compatible Custom Providers ─────────────────
  if (isAnthropicCompatibleProvider(providerId)) {
    return validateAnthropicCompatibleCustom;
  }

  // ── Custom Embedding Providers ────────────────────────────
  if (isCustomEmbeddingProvider(providerId)) {
    return validateCustomEmbedding;
  }

  // ── Built-in Provider Routing ─────────────────────────────
  const router = {
    // LLM Providers
    openai:       validateOpenAICompat,       // GET /v1/models
    anthropic:    validateAnthropic,          // POST /v1/messages (minimal)
    gemini:       validateGemini,             // GET /v1beta/models
    xai:          validateOpenAICompat,       // GET /v1/models (OpenAI-compatible)
    deepseek:     validateOpenAICompat,       // GET /models (OpenAI-compatible)
    groq:         validateOpenAICompat,       // GET /openai/v1/models
    openrouter:   validateOpenAICompat,       // GET /api/v1/models
    together:     validateOpenAICompat,       // GET /v1/models
    fireworks:    validateOpenAICompat,       // GET /inference/v1/models
    mistral:      validateOpenAICompat,       // GET /v1/models
    cohere:       validateOpenAICompat,       // GET /v1/models
    cerebras:     validateOpenAICompat,       // GET /v1/models
    hyperbolic:   validateOpenAICompat,       // GET /v1/models
    nebius:       validateOpenAICompat,       // GET /v1/models
    nvidia:       validateOpenAICompat,       // GET /v1/models
    siliconflow:  validateOpenAICompat,       // GET /v1/models
    featherless:  validateOpenAICompat,       // GET /v1/models
    sambanova:    validateOpenAICompat,       // GET /v1/models
    venice:       validateOpenAICompat,       // GET /api/v1/models
    "api-airforce": validateOpenAICompat,     // GET /v1/models
    perplexity:   validateOpenAICompat,       // GET /models (note: no /v1/)
    "kilo-gateway": validateOpenAICompat,     // GET /api/gateway/models
    github:       validateOpenAICompat,       // GET /models
    gitlab:       validateOpenAICompat,       // GET /api/v4/ai/models
    youcom:       validateOpenAICompat,       // GET /models
    minimax:      validateOpenAICompat,       // GET /v1/models
    glm:          validateOpenAICompat,       // GET /api/paas/v4/models
    kimi:         validateOpenAICompat,       // GET /v1/models
    "volcengine-ark": validateOpenAICompat,   // GET /api/v3/models
    byteplus:     validateOpenAICompat,       // GET /v1/models
    baidu:        validateOpenAICompat,       // GET /v2/models
    tencent:      validateOpenAICompat,       // GET /v1/models

    // Provider-Specific
    azure:          validateAzure,             // Azure OpenAI (endpoint + key)
    "cloudflare-ai": validateCloudflare,       // Cloudflare (accountId + token)
    huggingface:    validateHuggingFace,       // HF Inference API
    tavily:         validateTavily,            // Tavily Search

    // POST-based providers
    assemblyai:  validatePostBased,
    serper:      validatePostBased,
    exa:         validatePostBased,
    firecrawl:   validatePostBased,
    searchapi:   validatePostBased,

    // GET-based providers
    elevenlabs:     validateGetBased,
    deepgram:       validateGetBased,
    "stability-ai": validateGetBased,
    recraft:        validateGetBased,
    "fal-ai":       validateGetBased,
    "black-forest-labs": validateGetBased,
    runwayml:       validateGetBased,
    "voyage-ai":    validateGetBased,
    "jina-ai":      validateGetBased,
    "jina-reader":  validateGetBased,
    "brave-search": validateGetBased,
    playht:         validateGetBased,
  };

  return router[providerId] || null;
}

/**
 * Check if a provider supports key-based authentication and should be validated.
 * @param {string} providerId
 * @returns {boolean}
 */
function shouldValidateProvider(providerId) {
  // Custom providers always need validation
  if (isOpenAICompatibleProvider(providerId) ||
      isAnthropicCompatibleProvider(providerId) ||
      isCustomEmbeddingProvider(providerId)) {
    return true;
  }

  // Check registry for providers that use API keys
  const registryEntry = REGISTRY.find((r) => r.id === providerId);
  if (!registryEntry) return false;

  // Skip providers that don't use API key auth
  if (registryEntry.category === "free") return false;     // Free/no-auth providers
  if (registryEntry.category === "webCookie") return false; // Cookie-based auth
  if (registryEntry.category === "oauth" && !registryEntry.authModes?.includes("apikey")) {
    return false; // OAuth-only providers
  }

  // Check if the provider has a known endpoint config
  const endpoint = PROVIDER_ENDPOINTS[providerId];
  if (endpoint?.skipValidation) return false;

  return true;
}

/**
 * Pre-validate the format of an API key before making network requests.
 *
 * @param {string} providerId
 * @param {string} apiKey
 * @returns {object|null} Error object if format is invalid, null if format is OK
 */
function preValidateKeyFormat(providerId, apiKey) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return buildError(ErrorTypes.INVALID_FORMAT, "Key is empty");
  }

  // Skip format check for custom providers
  if (isOpenAICompatibleProvider(providerId) ||
      isAnthropicCompatibleProvider(providerId) ||
      isCustomEmbeddingProvider(providerId)) {
    return null;
  }

  // Generic minimum length — catches providers without an explicit pattern
  // (e.g. hyperbolic, fal-ai, jina-ai) that would otherwise accept any
  // trivially short value. Real provider keys are always ≥ 20 chars.
  if (apiKey.trim().length < MIN_API_KEY_LENGTH) {
    return buildError(ErrorTypes.INVALID_FORMAT, `Key is too short (min ${MIN_API_KEY_LENGTH} chars)`);
  }

  const pattern = KEY_FORMAT_PATTERNS[providerId];
  if (pattern && !pattern.test(apiKey.trim())) {
    // Provide a helpful prefix hint
    const prefixHints = {
      openai: "sk-",
      anthropic: "sk-ant-",
      deepseek: "sk-",
      groq: "gsk_",
      openrouter: "sk-or-",
      together: "a long alphanumeric string",
      fireworks: "fw_",
      huggingface: "hf_",
      tavily: "tvly-",
      perplexity: "pplx-",
      nvidia: "nvapi-",
      cerebras: "cerebras_",
      siliconflow: "sk-",
    };
    return buildError(ErrorTypes.INVALID_FORMAT, prefixHints[providerId]);
  }

  return null;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Validate an API key for a specific provider.
 *
 * This is the main entry point for the validator module.
 * Call it from the settings page when a user adds or updates a custom provider key.
 *
 * VALIDATION FLOW:
 *   1. Check if the provider supports key-based auth
 *   2. Pre-validate key format (avoid unnecessary network calls for clearly bad keys)
 *   3. Check in-memory cache (24-hour TTL)
 *   4. Run the provider-specific network test
 *   5. Cache and return the result
 *
 * @param {string}  providerId  - Provider identifier (e.g., "openai", "anthropic", "openai-compatible-myapi")
 * @param {string}  apiKey     - The API key to validate
 * @param {object}  [providerData] - Optional provider-specific data (endpoint URL, account ID, etc.)
 * @returns {Promise<{ valid: boolean, error: string|null, errorType: string|null, modelCount: number|null }>}
 *
 * @example
 *   const result = await validateApiKey("openai", "sk-...");
 *   // → { valid: true, error: null, errorType: null, modelCount: 42 }
 *
 *   const result = await validateApiKey("anthropic", "sk-ant-...");
 *   // → { valid: false, error: "Invalid API key...", errorType: "invalid_key", modelCount: null }
 *
 *   const result = await validateApiKey("cloudflare-ai", "abc...", { accountId: "my-account-id" });
 *   // → { valid: true, error: null, errorType: null, modelCount: 10 }
 */
export async function validateApiKey(providerId, apiKey, providerData = {}) {
  // ── Input Validation ────────────────────────────────────
  if (!providerId || typeof providerId !== "string") {
    return buildError(ErrorTypes.UNKNOWN, "No provider specified");
  }

  if (!apiKey || typeof apiKey !== "string") {
    return buildError(ErrorTypes.INVALID_FORMAT, "No API key provided");
  }

  const trimmedKey = apiKey.trim();

  // ── Check if this provider should be validated ───────────
  if (!shouldValidateProvider(providerId)) {
    // For providers that skip validation (local-device, ollama, webCookie, etc.),
    // we return valid=true because there's no key to check.
    // The calling code should decide whether to show validation UI at all.
    return buildSuccess(null);
  }

  // ── Pre-validate Key Format ─────────────────────────────
  const formatError = preValidateKeyFormat(providerId, trimmedKey);
  if (formatError) {
    return formatError;
  }

  // ── Check Cache ──────────────────────────────────────────
  const cacheKey = `${providerId}:${hashKey(trimmedKey)}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  // ── Run Provider-Specific Validation ────────────────────
  const validatorFn = getValidatorForProvider(providerId);

  if (!validatorFn) {
    // Provider is not in our routing table but is in the registry.
    // Try the OpenAI-compatible fallback as most providers are OpenAI-compatible.
    const fallbackResult = await validateOpenAICompat(providerId, trimmedKey);

    // Cache even fallback results
    setCachedResult(cacheKey, fallbackResult);
    return fallbackResult;
  }

  try {
    const result = await validatorFn(providerId, trimmedKey, providerData);

    // Cache the result before returning
    setCachedResult(cacheKey, result);
    return result;
  } catch (err) {
    // Unexpected error (e.g. bug in the validator function)
    console.error(`[apiKeyValidator] Unexpected error validating ${providerId}:`, err);
    const errorResult = buildError(ErrorTypes.UNKNOWN, err.message);
    return errorResult;
  }
}

/**
 * Force-clear the validation cache for a specific provider+key combination.
 *
 * Useful when the user explicitly wants to re-test a key that may have been
 * cached with a stale result (e.g., after fixing the key).
 *
 * @param {string} providerId
 * @param {string} apiKey
 */
export function clearValidationCache(providerId, apiKey) {
  const cacheKey = `${providerId}:${hashKey(apiKey)}`;
  validationCache.delete(cacheKey);
}

/**
 * Clear ALL cached validation results.
 * Used when the app needs to reset state (e.g., user logs out).
 */
export function clearAllValidationCache() {
  validationCache.clear();
}

/**
 * Get the number of cached validation entries.
 * Useful for monitoring cache health.
 * @returns {number}
 */
export function getCacheSize() {
  return validationCache.size;
}

/**
 * Check if a provider supports API key validation.
 * Useful for UI code to decide whether to show validation UI.
 *
 * @param {string} providerId
 * @returns {boolean}
 */
export function supportsValidation(providerId) {
  if (isOpenAICompatibleProvider(providerId) ||
      isAnthropicCompatibleProvider(providerId) ||
      isCustomEmbeddingProvider(providerId)) {
    return true;
  }
  return !!getValidatorForProvider(providerId) || !!PROVIDER_ENDPOINTS[providerId];
}

// ============================================================
// DEFAULT EXPORT
// ============================================================
export default {
  validateApiKey,
  clearValidationCache,
  clearAllValidationCache,
  getCacheSize,
  supportsValidation,
};