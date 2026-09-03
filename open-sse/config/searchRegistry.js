import { isProviderBlockedByIdOrAlias } from "../utils/omni/noAuthProviders.js";
const SEARCH_PROVIDERS = {
  "serper-search": {
    id: "serper-search",
    name: "Serper Search",
    baseUrl: "https://google.serper.dev",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 1e-3,
    freeMonthlyQuota: 2500,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "brave-search": {
    id: "brave-search",
    name: "Brave Search",
    baseUrl: "https://api.search.brave.com/res/v1",
    method: "GET",
    authType: "apikey",
    authHeader: "x-subscription-token",
    costPerQuery: 5e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "perplexity-search": {
    id: "perplexity-search",
    name: "Perplexity Search",
    baseUrl: "https://api.perplexity.ai/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 5e-3,
    freeMonthlyQuota: 0,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "exa-search": {
    id: "exa-search",
    name: "Exa Search",
    baseUrl: "https://api.exa.ai/search",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 7e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "tavily-search": {
    id: "tavily-search",
    name: "Tavily Search",
    baseUrl: "https://api.tavily.com/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 8e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  firecrawl: {
    id: "firecrawl",
    name: "Firecrawl",
    baseUrl: "https://api.firecrawl.dev/v2/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 2e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 3e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "google-pse-search": {
    id: "google-pse-search",
    name: "Google Programmable Search",
    baseUrl: "https://www.googleapis.com/customsearch/v1",
    method: "GET",
    authType: "apikey",
    authHeader: "key",
    costPerQuery: 5e-3,
    freeMonthlyQuota: 3e3,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 10,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "linkup-search": {
    id: "linkup-search",
    name: "Linkup Search",
    baseUrl: "https://api.linkup.so/v1/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 5e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "searchapi-search": {
    id: "searchapi-search",
    name: "SearchAPI",
    baseUrl: "https://www.searchapi.io/api/v1/search",
    method: "GET",
    authType: "apikey",
    authHeader: "api_key",
    costPerQuery: 4e-3,
    freeMonthlyQuota: 100,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "youcom-search": {
    id: "youcom-search",
    name: "You.com Search",
    baseUrl: "https://ydc-index.io/v1/search",
    method: "GET",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 5e-3,
    freeMonthlyQuota: 0,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "searxng-search": {
    id: "searxng-search",
    name: "SearXNG Search",
    baseUrl: "http://localhost:8888/search",
    method: "GET",
    authType: "none",
    authHeader: "none",
    costPerQuery: 0,
    freeMonthlyQuota: 999999,
    searchTypes: ["web", "news"],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 1e4,
    cacheTTLMs: 3 * 60 * 1e3,
    fallbackOnly: true
  },
  "ollama-search": {
    id: "ollama-search",
    name: "Ollama Search",
    baseUrl: "https://ollama.com/api/web_search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 10,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  "zai-search": {
    id: "zai-search",
    name: "Z.AI Coding Plan Search",
    baseUrl: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0,
    freeMonthlyQuota: 0,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3
  },
  // Jina Search (s.jina.ai). No extra dashboard card — credentials reuse
  // jina-ai / jina-reader / JINA_AI_API_KEY via SEARCH_CREDENTIAL_FALLBACKS.
  "jina-search": {
    id: "jina-search",
    name: "Jina Search (s.jina.ai)",
    baseUrl: "https://s.jina.ai",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 2e-3,
    freeMonthlyQuota: 1e3,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 50,
    timeoutMs: 15e3,
    cacheTTLMs: 5 * 60 * 1e3
  },
  // Context7 (context7.com) — library-docs search. Anonymous tier works without a
  // key (per-minute rate limit, context7-quota-tier: anonymous); a configured
  // ctx7sk-* key raises the quota, sent as Bearer when a connection exists.
  // fallbackOnly: doc-focused corpus, never auto-selected for generic web search.
  context7: {
    id: "context7",
    name: "Context7 (library docs)",
    baseUrl: "https://context7.com/api/v1",
    method: "GET",
    // authType "none" means the framework skips credential injection entirely
    // (registryUtils.ts). A configured ctx7sk-* key still reaches the builder
    // via params.token, which attaches it as Bearer manually — authHeader
    // stays "none" so the generic injector never double-writes it.
    // The Bearer attachment lives in buildContext7Request
    // (open-sse/handlers/search.ts) — keep the two in sync when editing.
    authType: "none",
    authHeader: "none",
    costPerQuery: 0,
    // Anonymous tier is unlimited per-minute (rate-limited, not metered):
    // a 0 here would let the quota preflight reject anonymous traffic (the
    // same reason DuckDuckGo uses 999999 — see its entry above).
    freeMonthlyQuota: 999999,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3,
    fallbackOnly: true
  },
  // Free, no-API-key DuckDuckGo lite scraping (free-claude-code port). Last-resort
  // only (fallbackOnly): never auto-selected over a configured provider; served by
  // the dedicated HTML path in open-sse/handlers/search.ts (not the generic JSON one).
  "duckduckgo-free": {
    id: "duckduckgo-free",
    name: "DuckDuckGo (free)",
    baseUrl: "https://lite.duckduckgo.com/lite/",
    method: "POST",
    authType: "none",
    authHeader: "none",
    costPerQuery: 0,
    freeMonthlyQuota: 999999,
    searchTypes: ["web"],
    defaultMaxResults: 5,
    maxMaxResults: 25,
    timeoutMs: 1e4,
    cacheTTLMs: 5 * 60 * 1e3,
    fallbackOnly: true
  },
  // SuperGrok / xAI server-side X Search. Not web search. Explicit provider or
  // search_type "x" only — never auto-selected for generic web queries.
  "x-search": {
    id: "x-search",
    name: "X Search (Grok)",
    baseUrl: "https://api.x.ai/v1/responses",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0,
    freeMonthlyQuota: 0,
    searchTypes: ["x"],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 6e4,
    cacheTTLMs: 5 * 60 * 1e3
  }
};
const SEARCH_CREDENTIAL_FALLBACKS = {
  "perplexity-search": "perplexity",
  "ollama-search": "ollama-cloud",
  "zai-search": "zai",
  "jina-search": "jina-ai",
  "x-search": ["xai-oauth", "xao", "xai"]
};
function getSearchCredentialFallbacks(providerId) {
  const mapped = SEARCH_CREDENTIAL_FALLBACKS[providerId];
  if (!mapped) return [];
  return Array.isArray(mapped) ? mapped : [mapped];
}
const SEARCH_PROVIDER_ALIASES = {
  "jina-ai": "jina-search",
  jina: "jina-search",
  brave: "brave-search",
  serper: "serper-search",
  perplexity: "perplexity-search",
  exa: "exa-search",
  tavily: "tavily-search",
  "google-pse": "google-pse-search",
  linkup: "linkup-search",
  ollama: "ollama-search",
  searchapi: "searchapi-search",
  youcom: "youcom-search",
  searxng: "searxng-search",
  zai: "zai-search",
  duckduckgo: "duckduckgo-free",
  ctx7: "context7",
  c7: "context7",
  x_search: "x-search",
  x: "x-search"
};
function resolveSearchProviderId(providerId) {
  return SEARCH_PROVIDER_ALIASES[providerId] || providerId;
}
const CATALOG_SEARXNG_DEFAULT_URL = "http://localhost:8888/search";
function isUnconfiguredLoopbackSearchProvider(provider) {
  if (!provider || provider.id !== "searxng-search") return false;
  const configured = String(provider.baseUrl || "").replace(/\/+$/, "");
  const catalog = CATALOG_SEARXNG_DEFAULT_URL.replace(/\/+$/, "");
  return configured === catalog;
}
function getSearchProvider(providerId) {
  return SEARCH_PROVIDERS[providerId] || null;
}
function resolveSearchProvider(providerId) {
  return SEARCH_PROVIDERS[resolveSearchProviderId(providerId)] || null;
}
function supportsSearchType(providerOrId, searchType) {
  const provider = typeof providerOrId === "string" ? resolveSearchProvider(providerOrId) : providerOrId || null;
  if (!provider) return false;
  return provider.searchTypes.includes(searchType);
}
function getAllSearchProviders(blockedProviders = []) {
  return Object.values(SEARCH_PROVIDERS).filter((p) => !p.disabled && !isProviderBlockedByIdOrAlias(p.id, blockedProviders)).map((p) => ({
    id: p.id,
    name: p.name,
    searchTypes: p.searchTypes
  }));
}
function selectProvider(explicitProvider, searchType) {
  if (explicitProvider) {
    const provider = resolveSearchProvider(explicitProvider);
    if (!provider) return null;
    if (searchType && !supportsSearchType(provider, searchType)) return null;
    return provider;
  }
  const effectiveType = searchType || "web";
  const providers = Object.values(SEARCH_PROVIDERS).filter(
    (provider) => !provider.fallbackOnly && supportsSearchType(provider, effectiveType)
  );
  if (providers.length === 0) return null;
  return providers.reduce((cheapest, p) => p.costPerQuery < cheapest.costPerQuery ? p : cheapest);
}
export {
  SEARCH_CREDENTIAL_FALLBACKS,
  SEARCH_PROVIDERS,
  SEARCH_PROVIDER_ALIASES,
  getAllSearchProviders,
  getSearchCredentialFallbacks,
  getSearchProvider,
  isUnconfiguredLoopbackSearchProvider,
  resolveSearchProvider,
  resolveSearchProviderId,
  selectProvider,
  supportsSearchType
};
