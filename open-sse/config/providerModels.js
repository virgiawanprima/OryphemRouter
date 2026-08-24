import { PROVIDERS } from "./providers.js";
import REGISTRY from "../providers/registry/index.js";
// PROVIDER_MODELS now built from providers/registry (transport + models co-located)
import { PROVIDER_MODELS } from "../providers/index.js";
import { modelQuotaFamily, modelStrip, modelTargetFormat, modelSupportedFormats, normalizeModelId } from "../providers/models/schema.js";
import { CODEX_REVIEW_SUFFIX } from "../providers/models/helpers.js";
export { PROVIDER_MODELS };

// PROVIDER_MODELS is keyed by the full canonical provider id. Resolve any
// alias (short or long) to that canonical id before indexing, so lookups stay
// correct regardless of which form the caller passed.
const ALIAS_TO_ID = new Map();
for (const e of REGISTRY) {
  ALIAS_TO_ID.set(e.id, e.id);
  if (e.alias) ALIAS_TO_ID.set(e.alias, e.id);
  for (const a of e.aliases || []) ALIAS_TO_ID.set(a, e.id);
}
function resolveModelsKey(aliasOrId) {
  return ALIAS_TO_ID.get(aliasOrId) || aliasOrId;
}

// Helper functions
export function getProviderModels(aliasOrId) {
  return PROVIDER_MODELS[resolveModelsKey(aliasOrId)] || [];
}

export function getDefaultModel(aliasOrId) {
  const models = PROVIDER_MODELS[resolveModelsKey(aliasOrId)];
  return models?.[0]?.id || null;
}

// Providers whose registry uses dots in version numbers (e.g. "claude-sonnet-4.5").
// For these, we tolerate clients sending dashes ("claude-sonnet-4-5") by normalizing
// digit-hyphen-digit to digit-dot-digit before lookup. Other providers are left untouched.
const DOT_VERSION_PROVIDERS = new Set(["kr", "kiro"]);

// Find a registry entry by id. For Kiro models, tolerates dash/dot version separators
// ("claude-sonnet-4-5" ~= "claude-sonnet-4.5"). Other providers use exact match only.
function findModel(models, modelId, aliasOrId) {
  if (!models) return undefined;
  const found = models.find(m => m.id === modelId);
  if (found) return found;
  if (!DOT_VERSION_PROVIDERS.has(aliasOrId)) return undefined;
  const normalized = normalizeModelId(modelId);
  if (normalized === modelId) return undefined;
  return models.find(m => m.id === normalized);
}

export function isValidModel(aliasOrId, modelId, passthroughProviders = new Set()) {
  const key = resolveModelsKey(aliasOrId);
  if (passthroughProviders.has(aliasOrId) || passthroughProviders.has(key)) return true;
  const models = PROVIDER_MODELS[key];
  if (!models) return false;
  return !!findModel(models, modelId, key);
}

export function findModelName(aliasOrId, modelId) {
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return modelId;
  const found = findModel(models, modelId, key);
  return found?.name || modelId;
}

export function getModelTargetFormat(aliasOrId, modelId) {
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return null;
  return modelTargetFormat(findModel(models, modelId, key));
}

// Declared upstream formats for a model (registry `supportedFormats`). Drives the
// per-model guard on the sourceFormat-matched transport; null when undeclared.
export function getModelSupportedFormats(aliasOrId, modelId) {
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return null;
  return modelSupportedFormats(findModel(models, modelId, key));
}

export function getModelType(aliasOrId, modelId) {
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  if (!models) return null;
  const found = findModel(models, modelId, key);
  return found?.kind || found?.type || null;
}

export function getModelUpstreamId(aliasOrId, modelId) {
  // Split off thinking suffix "(level)" so lookup hits the base id; re-append it to
  // the result so downstream applyThinking still sees the suffix (body.model is stripped separately).
  const sufMatch = typeof modelId === "string" ? modelId.match(/\([^()]+\)\s*$/) : null;
  const suffix = sufMatch ? sufMatch[0] : "";
  const baseId = suffix ? modelId.slice(0, sufMatch.index).trim() : modelId;
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  const found = findModel(models, baseId, key);
  const resolvedId = found?.upstreamModelId || found?.id;
  if (resolvedId) {
    const presetMatch = resolvedId.match(/\([^()]+\)\s*$/);
    const presetSuffix = presetMatch?.[0] || "";
    const resolvedBase = presetSuffix ? resolvedId.slice(0, presetMatch.index).trim() : resolvedId;
    return resolvedBase + (suffix || presetSuffix);
  }
  if (key === "codex" && typeof baseId === "string" && baseId.endsWith(CODEX_REVIEW_SUFFIX)) {
    return baseId.slice(0, -CODEX_REVIEW_SUFFIX.length) + suffix;
  }
  return baseId + suffix;
}

export function getModelQuotaFamily(aliasOrId, modelId) {
  const key = resolveModelsKey(aliasOrId);
  const models = PROVIDER_MODELS[key];
  return modelQuotaFamily(findModel(models, modelId, key));
}

// Canonical id → id (no shortened aliases). Model lookups use the full provider id;
// shortened aliases are rejected at the request boundary (see src/sse/services/model.js).
export const PROVIDER_ID_TO_ALIAS = Object.fromEntries(
  Object.keys(PROVIDERS).map(id => [id, id])
);

export function getModelsByProviderId(providerId) {
  return PROVIDER_MODELS[resolveModelsKey(providerId)] || [];
}

// Get strip list for a model entry (explicit opt-in only)
// Returns array of content types to strip, e.g. ["image", "audio"]
export function getModelStrip(alias, modelId) {
  const key = resolveModelsKey(alias);
  return modelStrip(findModel(PROVIDER_MODELS[key], modelId, key));
}
