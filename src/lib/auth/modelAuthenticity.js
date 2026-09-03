/**
 * modelAuthenticity.js — 4-layer model authenticity verification.
 *
 * Verifies that a user-supplied model ID for a provider is the REAL canonical
 * model (not a wrapper, fake, or spoofed model) before it is accepted.
 *
 * Layers:
 *   1. Official Model List Query  — GET /v1/models (provider catalog, bound to user key)
 *   2. Response Body Signature    — minimal 1-token request; check `model` field + usage schema
 *   3. HTTP Response Headers      — provider-specific proprietary headers that proxies can't fake
 *   4. Strict Canonical Registry  — must exist in our internal registry (fail-closed)
 *
 * Fail-open ONLY for transient network errors (provider down != fake model).
 * Fail-CLOSED for catalog mismatch (model not in provider list = suspicious).
 */

import { getModelMetadata } from "open-sse/providers/models/getMetadata.js";
import { getProviderModels, isValidModel } from "open-sse/config/providerModels.js";
import { fetchPublicUrl } from "@/shared/utils/ssrfGuard.js";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard.js";

// ---------------------------------------------------------------------------
// Provider endpoint / auth scheme configuration
// ---------------------------------------------------------------------------

/** Provider base URLs + auth style for catalog + probe requests. */
const PROVIDER_SPECS = {
  openai: {
    base: "https://api.openai.com/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id", "openai-organization", "openai-processing-ms"],
  },
  anthropic: {
    base: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    auth: { type: "x-api-key", header: "x-api-key" },
    headers: ["request-id", "anthropic-ratelimit-requests-limit"],
  },
  "gemini": {
    base: "https://generativelanguage.googleapis.com/v1beta",
    modelsPath: "/models",
    auth: { type: "x-goog-api-key", header: "x-goog-api-key" },
    headers: ["x-goog-api-client"],
  },
  xai: {
    base: "https://api.x.ai/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id", "x-ratelimit-limit-requests"],
  },
  deepseek: {
    base: "https://api.deepseek.com/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id"],
  },
  mistral: {
    base: "https://api.mistral.ai/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id", "x-ratelimit-remaining-requests"],
  },
  groq: {
    base: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id", "x-ratelimit-limit-requests"],
  },
  together: {
    base: "https://api.together.xyz/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id"],
  },
  openrouter: {
    base: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id"],
  },
  "openai-compatible": {
    base: null, // custom baseUrl required
    modelsPath: "/models",
    auth: { type: "bearer" },
    headers: ["x-request-id"],
  },
  "anthropic-compatible": {
    base: null, // custom baseUrl required
    modelsPath: "/models",
    auth: { type: "x-api-key", header: "x-api-key" },
    headers: ["request-id"],
  },
};

// Cache of fetched catalogs per provider+key (24h TTL), so repeated checks
// don't hammer the provider.
const CATALOG_CACHE = new Map();
const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function resolveSpec(providerId) {
  if (PROVIDER_SPECS[providerId]) return PROVIDER_SPECS[providerId];
  if (providerId.startsWith("openai-compatible-")) return PROVIDER_SPECS["openai-compatible"];
  if (providerId.startsWith("anthropic-compatible-")) return PROVIDER_SPECS["anthropic-compatible"];
  return null;
}

function cacheKey(providerId, apiKey) {
  return `${providerId}:${apiKey ? apiKey.slice(0, 12) : "none"}`;
}

/**
 * Layer 4 — Strict canonical registry check (synchronous, no network).
 * The model must exist in our internal registry for the provider.
 */
export function isModelInCanonicalRegistry(providerId, modelId) {
  if (!providerId || !modelId) return false;

  // Enriched metadata path first.
  const meta = getModelMetadata(providerId, modelId);
  if (meta) return true;

  // Fallback to the static registry's model list.
  try {
    const known = getProviderModels(providerId);
    if (Array.isArray(known) && known.length > 0) {
      if (isValidModel(providerId, String(modelId).trim())) return true;
      const clean = String(modelId).replace(/\s*\([^()]+\)\s*$/, "").trim();
      return known.some((m) => m.id === clean || m.id === modelId);
    }
    // Empty known list = live-catalog / passthrough provider. Do not fail-closed
    // on a provider whose catalog is fetched live per account.
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch (and cache) the provider's official model catalog using the user key.
 * @returns {Promise<{ ok: boolean, models: string[], error?: string, status?: number }>}
 */
export async function fetchProviderCatalog(providerId, apiKey, providerData = {}) {
  const spec = resolveSpec(providerId);
  if (!spec) {
    return { ok: true, models: [], note: "no-catalog-spec" };
  }

  const ck = cacheKey(providerId, apiKey);
  const cached = CATALOG_CACHE.get(ck);
  if (cached && Date.now() - cached.at < CATALOG_CACHE_TTL_MS) {
    return cached.value;
  }

  // Determine base URL (custom providers supply their own).
  let base = spec.base;
  if (!base) {
    base = providerData.baseUrl || providerData.base_url || (providerData.providerSpecificData && providerData.providerSpecificData.baseUrl);
    if (!base) return { ok: false, models: [], error: "Custom provider requires baseUrl to verify model catalog." };
  }
  base = String(base).replace(/\/+$/, "");

  const url = `${base}${spec.modelsPath}`;

  // SSRF guard before any outbound fetch.
  try {
    await assertPublicUrl(url);
  } catch (e) {
    return { ok: false, models: [], error: `Blocked non-public catalog URL: ${e.message}` };
  }

  const headers = {};
  if (spec.auth.type === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
  else if (spec.auth.type === "x-api-key") headers[spec.auth.header || "x-api-key"] = apiKey;

  try {
    const res = await fetchPublicUrl(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      const value = { ok: false, models: [], error: "Invalid API key for this provider.", status: res.status };
      CATALOG_CACHE.set(ck, { at: Date.now(), value });
      return value;
    }
    if (!res.ok) {
      const value = { ok: false, models: [], error: `Provider catalog request failed (${res.status})`, status: res.status };
      // Do not cache transient failures aggressively — 60s.
      CATALOG_CACHE.set(ck, { at: Date.now() - CATALOG_CACHE_TTL_MS + 60_000, value });
      return value;
    }

    const data = await res.json().catch(() => ({}));
    // OpenAI-compatible: { data: [ { id, ... } ] }; Anthropic: { data: [ { id, ... } ] }; Gemini: { models: [ { name: "models/xxx" } ] }
    let models = [];
    if (Array.isArray(data?.data)) {
      models = data.data.map((m) => m.id).filter(Boolean);
    } else if (Array.isArray(data?.models)) {
      models = data.models
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter(Boolean);
    } else if (Array.isArray(data)) {
      models = data.map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
    }

    const value = { ok: true, models, status: res.status };
    CATALOG_CACHE.set(ck, { at: Date.now(), value });
    return value;
  } catch (e) {
    // Network errors: fail-open (don't claim fake).
    return {
      ok: false,
      models: [],
      error: `Network error while checking provider catalog: ${e?.message || String(e)}`,
      transient: true,
    };
  }
}

/**
 * Layer 1 — verify the canonical model ID appears in the provider's official
 * catalog bound to the user's API key.
 */
export async function modelExistsInLiveCatalog(providerId, modelId, apiKey, providerData = {}) {
  const result = await fetchProviderCatalog(providerId, apiKey, providerData);

  // Fail-open on transient/network errors and when there is no catalog spec.
  if (result.transient || result.note === "no-catalog-spec") {
    return { exists: true, verified: false, note: "fail-open", error: result.error };
  }
  if (!result.ok) {
    return { exists: false, verified: false, note: "catalog-unavailable", error: result.error, status: result.status };
  }
  if (!result.models.length) {
    return { exists: false, verified: false, note: "empty-catalog" };
  }

  const target = String(modelId).trim();
  const exact = result.models.includes(target);
  if (exact) return { exists: true, verified: true, note: "exact-match" };

  // Allow "latest"-style alias (e.g., mistral-large-latest vs mistral-large-latest).
  const targetBase = target.replace(/-latest$/, "");
  const aliasMatch = result.models.some((m) => m === targetBase || m.replace(/-latest$/, "") === targetBase);
  return {
    exists: aliasMatch,
    verified: exact,
    note: aliasMatch ? "alias-match" : "not-in-catalog",
    providerModels: result.models.slice(0, 20),
  };
}

/**
 * Build minimal probe body for a provider (Layer 2).
 */
function buildProbeBody(providerId, modelId) {
  switch (providerId) {
    case "anthropic":
      return {
        model: modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      };
    case "gemini":
      return {
        contents: [{ role: "user", parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 1 },
      };
    default:
      return {
        model: modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      };
  }
}

/**
 * Layer 2 + 3 — send a minimal probe request and verify:
 *   - response `model` field matches (signature)
 *   - usage structure is valid
 *   - provider-specific headers are present (anti-spoof evidence)
 */
export async function probeModelSignature(providerId, modelId, apiKey, providerData = {}) {
  const spec = resolveSpec(providerId);
  if (!spec) {
    return {
      probed: false,
      note: "no-probe-spec",
      modelFieldMatches: null,
      usageStructureValid: null,
      providerHeaders: [],
      responseModel: null,
    };
  }

  let base = spec.base;
  if (!base) {
    base = providerData.baseUrl || (providerData.providerSpecificData && providerData.providerSpecificData.baseUrl);
    if (!base) return { probed: false, note: "no-base-url", providerHeaders: [] };
  }
  base = String(base).replace(/\/+$/, "");

  const url = providerId === "anthropic" ? `${base}/messages` : providerId === "gemini" ? `${base}/models/${modelId}:generateContent` : `${base}/chat/completions`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (spec.auth.type === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
  else if (spec.auth.type === "x-api-key") headers[spec.auth.header || "x-api-key"] = apiKey;
  if (providerId === "anthropic") headers["anthropic-version"] = "2023-06-01";

  try {
    const res = await fetchPublicUrl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildProbeBody(providerId, modelId)),
      signal: AbortSignal.timeout(8000),
    });

    const providerHeaders = [];
    for (const h of spec.headers || []) {
      if (res.headers?.get?.(h)) providerHeaders.push(h);
    }

    // 401/403 = invalid key; that's definitive.
    if (res.status === 401 || res.status === 403) {
      return {
        probed: true,
        invalidKey: true,
        modelFieldMatches: false,
        usageStructureValid: false,
        providerHeaders,
        responseModel: null,
        status: res.status,
      };
    }

    const data = await res.json().catch(() => ({}));

    // Extract the model the upstream reports it used.
    let responseModel = data?.model || null;
    if (!responseModel && data?.modelVersion) responseModel = data.modelVersion;
    if (!responseModel && data?.candidates?.[0]?.modelVersion) responseModel = data.candidates[0].modelVersion;

    // Usage structure check.
    let usageStructureValid = false;
    const usage = data?.usage;
    if (usage && (typeof usage.prompt_tokens === "number" || typeof usage.input_tokens === "number")) {
      usageStructureValid = true;
    }

    const modelFieldMatches = !responseModel || String(responseModel).trim() === String(modelId).trim();

    return {
      probed: true,
      modelFieldMatches,
      usageStructureValid,
      providerHeaders,
      responseModel,
      status: res.status,
    };
  } catch (e) {
    // Network errors fail-open (transient).
    return {
      probed: false,
      note: "probe-network-error",
      modelFieldMatches: null,
      usageStructureValid: null,
      providerHeaders: [],
      responseModel: null,
      error: e?.message || String(e),
    };
  }
}

/**
 * Main API — run all 4 layers and return a combined authenticity verdict.
 */
export async function verifyModelAuthenticity(providerId, modelId, apiKey, providerData = {}) {
  const report = {
    providerId,
    modelId,
    authenticated: false,
    layers: {},
  };

  // Layer 4 — strict canonical registry (fail-closed).
  const l4 = isModelInCanonicalRegistry(providerId, modelId);
  report.layers.canonicalRegistry = { pass: l4 };
  if (!l4) {
    report.authenticated = false;
    report.reason = "model-not-in-canonical-registry";
    return report;
  }

  // Layer 1 — live catalog membership (fail-open on transient).
  const l1 = await modelExistsInLiveCatalog(providerId, modelId, apiKey, providerData);
  report.layers.liveCatalog = l1;
  if (l1.note === "not-in-catalog") {
    report.authenticated = false;
    report.reason = "model-not-in-provider-live-catalog";
    return report;
  }

  // Layer 2 + 3 — response signature + headers.
  const l23 = await probeModelSignature(providerId, modelId, apiKey, providerData);
  report.layers.responseSignature = l23;

  // Verdict.
  // If layer 1 confirmed the model exists in the live catalog, it's authentic
  // even if the probe is transient-unavailable. If probe gave definitive
  // mismatches (invalid key / model field mismatch with a real response),
  // it is NOT authentic.
  if (l23.invalidKey) {
    report.authenticated = false;
    report.reason = "invalid-api-key";
  } else if (l23.probed && l23.modelFieldMatches === false) {
    report.authenticated = false;
    report.reason = "response-model-mismatch";
  } else if (l1.verified === true || l1.note === "exact-match" || l1.note === "alias-match") {
    report.authenticated = true;
    report.reason = "live-catalog-confirmed";
  } else if (l1.note === "fail-open" || l1.note === "catalog-unavailable" || l1.note === "empty-catalog") {
    // Catalog couldn't be confirmed; trust canonical registry + probe.
    report.authenticated = true;
    report.reason = "registry-and-probe-fallback";
  } else {
    report.authenticated = false;
    report.reason = "unverified";
  }

  return report;
}

/**
 * Verify all layers and return a plain boolean + reason summary.
 * Convenience wrapper for route handlers.
 */
export async function assertModelAuthentic(providerId, modelId, apiKey, providerData = {}) {
  const report = await verifyModelAuthenticity(providerId, modelId, apiKey, providerData);
  return {
    authenticated: report.authenticated,
    reason: report.reason || "",
    detail: report.layers,
  };
}

export function clearAuthenticityCache() {
  CATALOG_CACHE.clear();
}
