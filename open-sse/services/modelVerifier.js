// ModelVerifier — "anti-kebohongan" model authenticity check.
//
// Given a provider + credentials, it fetches the provider's REAL model catalog and
// diffs it against the models we advertise, classifying each as:
//   verified  — the advertised id exists in the real catalog
//   corrected — the advertised id maps to a real catalog id via upstreamModelId
//   missing   — advertised but NOT in the real catalog (fake/stale/typo)
//
// Always fail-open: if the live catalog cannot be fetched (offline, no endpoint,
// auth error) it returns `live: null` and marks nothing as fake — key validation
// is never blocked by this check.

import { PROVIDERS } from "../config/providers.js";
import { getProviderModels } from "../config/providerModels.js";
import { deriveModelName } from "../providers/models/namePatterns.js";

// Well-known live model endpoints for built-in API-key providers.
const MODELS_ENDPOINTS = {
  openai: { url: "https://api.openai.com/v1/models", auth: "Bearer" },
  anthropic: { url: "https://api.anthropic.com/v1/models", auth: "x-api-key" },
  deepseek: { url: "https://api.deepseek.com/models", auth: "Bearer" },
  xai: { url: "https://api.x.ai/v1/models", auth: "Bearer" },
  groq: { url: "https://api.groq.com/openai/v1/models", auth: "Bearer" },
  openrouter: { url: "https://openrouter.ai/api/v1/models", auth: "Bearer" },
  perplexity: { url: "https://api.perplexity.ai/models", auth: "Bearer" },
  "fireworks-ai": { url: "https://api.fireworks.ai/inference/v1/models", auth: "Bearer" },
  together: { url: "https://api.together.xyz/v1/models", auth: "Bearer" },
  mistral: { url: "https://api.mistral.ai/v1/models", auth: "Bearer" },
  "openai-compatible": { url: null, auth: "Bearer" }, // baseUrl from credentials
  "anthropic-compatible": { url: null, auth: "x-api-key" },
};

function authHeaders(endpoint, apiKey) {
  if (!apiKey) return { Accept: "application/json" };
  if (endpoint.auth === "x-api-key") {
    return { Accept: "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }
  return { Accept: "application/json", Authorization: `Bearer ${apiKey}` };
}

// Parse an OpenAI/Anthropic-style catalog body into [{id, name}].
function parseCatalog(data) {
  const list = Array.isArray(data)
    ? data
    : data?.data || data?.models || data?.results || [];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    if (typeof raw === "string") {
      out.push({ id: raw, name: deriveModelName(raw) });
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id ?? raw.model ?? raw.slug ?? raw.name ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: raw.display_name ?? raw.displayName ?? raw.name ?? deriveModelName(id),
    });
  }
  return out;
}

async function fetchCatalog(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return parseCatalog(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a provider's advertised models against its real catalog.
 * @param {object} opts
 * @param {string} opts.provider  - provider id (full)
 * @param {object} [opts.credentials] - { apiKey, accessToken, providerSpecificData }
 * @param {string[]} [opts.additionalModels] - user-added/custom model ids to check
 * @returns {Promise<{ live: Array|null, verified: string[], corrected: string[], missing: string[], catalog: Array }>}
 */
export async function verifyProviderModels({ provider, credentials = {}, additionalModels = [] }) {
  const providerId = String(provider || "").toLowerCase();

  // Determine endpoint.
  let endpoint = MODELS_ENDPOINTS[providerId] || null;
  if (!endpoint && providerId.startsWith("openai-compatible")) {
    endpoint = MODELS_ENDPOINTS["openai-compatible"];
  } else if (!endpoint && providerId.startsWith("anthropic-compatible")) {
    endpoint = MODELS_ENDPOINTS["anthropic-compatible"];
  }

  // Compatible providers carry their own baseUrl; built-ins use the known map.
  let url = endpoint?.url || null;
  if (!url && (providerId.startsWith("openai-compatible") || providerId.startsWith("anthropic-compatible"))) {
    const base = credentials?.providerSpecificData?.baseUrl;
    if (base) {
      const cleaned = String(base).replace(/\/+$/, "").replace(/\/v1\/messages$/, "");
      url = `${cleaned}/models`;
    }
  }
  // Last resort: derive from transport baseUrl if the provider has one.
  if (!url && PROVIDERS[providerId]?.baseUrl) {
    const base = String(PROVIDERS[providerId].baseUrl).replace(/\/+$/, "");
    // If baseUrl already ends in a well-known path, derive the models path.
    const stripped = base
      .replace(/\/chat\/completions$/, "")
      .replace(/\/v1\/messages$/, "")
      .replace(/\/responses$/, "");
    url = `${stripped}/models`;
  }

  const apiKey = credentials?.apiKey || credentials?.accessToken;
  const auth = endpoint ? authHeaders(endpoint, apiKey) : { Accept: "application/json" };
  let live = null;
  if (url) live = await fetchCatalog(url, auth);

  // Advertised set = static registry models + custom models.
  const staticModels = getProviderModels(providerId);
  const advertisedIds = new Set([
    ...staticModels.map((m) => m.id),
    ...additionalModels,
  ].filter(Boolean));

  const liveIds = new Set((live || []).map((m) => m.id));
  const verified = [];
  const corrected = [];
  const missing = [];

  for (const id of advertisedIds) {
    if (liveIds.has(id)) {
      verified.push(id);
      continue;
    }
    // Check if the model maps to a real catalog id via upstreamModelId.
    const model = staticModels.find((m) => m.id === id);
    const wireId = model?.upstreamModelId;
    if (wireId && liveIds.has(wireId)) {
      corrected.push({ id, realId: wireId });
    } else if (!live) {
      // No live catalog — cannot call it fake; leave it out of missing.
      // (kept out of missing so we don't false-positive when offline)
    } else {
      missing.push(id);
    }
  }

  return {
    live,
    verified,
    corrected,
    missing,
    catalog: live || [],
  };
}
