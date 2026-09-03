// ADAPTED STUB — ported from OmniRoute open-sse/config/providerRegistry.ts
//
// unified by integration — canonical provider-registry facade for
// open-sse/utils/omni. Merges the parallel ports:
//   providerRegistry.js      -> getRegistryEntry
//   providers.js             -> getProviderById, getProviderAlias, NOAUTH_PROVIDERS,
//                               APIKEY_PROVIDERS, WEB_COOKIE_PROVIDERS, AI_PROVIDERS
//   omniProviderRegistry.js  -> REGISTRY, getProviderCategory
//   providerRegistryStub.js  -> REGISTRY, getRegistryEntry (now backed by the real registry)
//   omniProvidersConstants.js-> prefix helpers
// Those files re-export from here so every importer resolves the same definitions.
// Backed by OryphemRouter's existing provider REGISTRY (array of entries with
// `id`, `alias`, `category`, `authType`, `transport.format`, ...).
import REGISTRY_ARR from "../../providers/registry/index.js";

const _byId = new Map();
const _byAlias = new Map();
for (const entry of REGISTRY_ARR || []) {
  if (entry && entry.id) _byId.set(String(entry.id).toLowerCase(), entry);
  if (entry && entry.alias && entry.alias !== entry.id) {
    _byAlias.set(String(entry.alias).toLowerCase(), entry);
  }
}

/** Get registry entry by provider ID or alias (case-insensitive). */
export function getRegistryEntry(provider) {
  if (!provider) return null;
  const normalized = String(provider).toLowerCase();
  return _byId.get(normalized) || _byAlias.get(normalized) || null;
}

/** Resolve provider id -> { id, alias } record (from providers.js port). */
export function getProviderById(id) {
  if (id === undefined || id === null) return undefined;
  const entry = getRegistryEntry(id);
  if (!entry) return undefined;
  return { id: entry.id, alias: entry.uiAlias || entry.alias || entry.id };
}

/** Resolve a provider's display alias (from providers.js port). */
export function getProviderAlias(providerId) {
  return getProviderById(providerId)?.alias || providerId;
}

/** Categorize a provider as "oauth" or "apikey" (from omniProviderRegistry.js port). */
// Preserves the exact categorization of the original parallel port's hardcoded
// map (the real registry often leaves authType undefined, e.g. anthropic/openai),
// then falls back to the real registry's category/authType for unknown providers.
const LEGACY_CATEGORY = {
  anthropic: "apikey", claude: "oauth", openai: "apikey", chatgpt: "oauth",
  gemini: "apikey", google: "oauth", grok: "apikey", deepseek: "apikey",
  "deepseek-web": "oauth", "claude-web": "oauth", "chatgpt-web": "oauth",
  "gemini-web": "oauth", "grok-web": "oauth", "qwen-web": "oauth",
  "kimi-web": "oauth", "copilot-web": "oauth", "poe-web": "oauth",
  "perplexity-web": "oauth", "blackbox-web": "oauth", "duckduckgo-web": "oauth",
  "zai-web": "oauth", "muse-spark-web": "oauth", antigravity: "apikey",
  agy: "apikey", codex: "oauth", groq: "apikey", together: "apikey",
  mistral: "apikey", openrouter: "apikey", fireworks: "apikey", xai: "apikey",
  cohere: "apikey", replicate: "apikey", huggingface: "apikey", ollama: "apikey",
};
export function getProviderCategory(provider) {
  if (typeof provider !== "string" || !provider) return "apikey";
  const legacy = LEGACY_CATEGORY[provider.toLowerCase()];
  if (legacy) return legacy;
  const entry = getRegistryEntry(provider);
  if (!entry) return "apikey";
  if (entry.category === "apikey") return "apikey";
  if (entry.category === "oauth" || entry.category === "webCookie") return "oauth";
  return entry.authType === "apikey" ? "apikey" : "oauth";
}

/** REGISTRY object keyed by provider id (compat with omniProviderRegistry.js `REGISTRY[provider]`). */
export const REGISTRY = Object.fromEntries(
  (REGISTRY_ARR || []).map((e) => [e.id, e])
);

// Provider maps (from providers.js port)
const _record = (e) => ({ id: e.id, alias: e.uiAlias || e.alias || e.id });

export const NOAUTH_PROVIDERS = Object.fromEntries(
  (REGISTRY_ARR || [])
    .filter((e) => e.noAuth || e.category === "noauth" || e.category === "free")
    .map((e) => [e.id, _record(e)])
);

// API-key providers (registry category "apikey").
export const APIKEY_PROVIDERS = Object.fromEntries(
  (REGISTRY_ARR || []).filter((e) => e.category === "apikey").map((e) => [e.id, _record(e)])
);

// Web-cookie providers (registry category "webCookie").
export const WEB_COOKIE_PROVIDERS = Object.fromEntries(
  (REGISTRY_ARR || []).filter((e) => e.category === "webCookie").map((e) => [e.id, _record(e)])
);

// Combined AI provider map (used by mcp-server/catalog.js port).
export const AI_PROVIDERS = { ...NOAUTH_PROVIDERS, ...APIKEY_PROVIDERS, ...WEB_COOKIE_PROVIDERS };

// Prefix helpers (from omniProvidersConstants.js port)
export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";
export function isOpenAiCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}
export function isAnthropicCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}
