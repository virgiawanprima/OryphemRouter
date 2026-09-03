// Lookup helper for model metadata.
//
// Resolution order:
//   1. MODEL_METADATA (curated enrichment in ./metadata.js) merged with the
//      registry entry's transport fields (contextLength, toolCalling, …) so
//      callers get the union of canonical + provider-declared data.
//   2. GENERATED_METADATA (derived from the ported registry by
//      scripts/sync-model-metadata.mjs) — normalized metadata for every
//      registered model (contextWindow/vision/reasoning/toolCalling).
//   3. Registry entry (fallback — raw `{ id, name, ... }` from ../registry/*.js)
//   4. null (unknown model)
import REGISTRY from "../registry/index.js";
import { MODEL_METADATA } from "./metadata.js";
import { GENERATED_METADATA } from "./generatedMetadata.js";
import { getPricingForModel } from "../pricing.js";

/** Find the raw registry model entry (string → { id }) or null. */
export function findRegistryModel(providerId, modelId) {
  const provider = REGISTRY.find((p) => p.id === providerId);
  const entry = provider?.models?.find((m) => (typeof m === "string" ? m : m.id) === modelId);
  if (entry === undefined) return null;
  return typeof entry === "string" ? { id: entry } : entry;
}

/**
 * Resolve model metadata: canonical MODEL_METADATA merged with the registry
 * entry's transport fields (contextLength, toolCalling, supportsVision,
 * supportsReasoning, maxOutputTokens, kind, …). Canonical name wins; the
 * registry supplies whatever the enrichment layer doesn't declare.
 */
export function getModelMetadata(providerId, modelId) {
  const registryEntry = findRegistryModel(providerId, modelId);
  const enriched = MODEL_METADATA[modelId] ?? GENERATED_METADATA[modelId];

  if (enriched === undefined) {
    // Fallback: surface the raw registry entry (id/name + provider-declared fields).
    return registryEntry;
  }

  if (!registryEntry) {
    return enriched;
  }

  // Merge: registry transport fields kept, canonical metadata wins for the
  // fields it declares (name, contextWindow, vision, reasoning, toolCalling, …).
  const merged = { ...registryEntry };
  for (const [k, v] of Object.entries(enriched)) {
    if (v !== undefined) merged[k] = v;
  }
  // Map legacy registry field names to the enrichment vocabulary where missing.
  if (merged.contextWindow === undefined && merged.contextLength !== undefined) {
    merged.contextWindow = merged.contextLength;
  }
  if (merged.vision === undefined && merged.supportsVision !== undefined) {
    merged.vision = merged.supportsVision;
  }
  if (merged.reasoning === undefined && merged.supportsReasoning !== undefined) {
    merged.reasoning = merged.supportsReasoning;
  }
  return merged;
}

/**
 * Resolve model pricing ($/1M tokens) via pricing.js fallback chain
 * (provider-specific → canonical → pattern). If the model carries a
 * `rateMultiplier` in the ported registry (e.g. GPT-5.6 Sol ×2.4), the base
 * pricing is scaled by that multiplier.
 */
export function getModelPricing(providerId, modelId) {
  const base = getPricingForModel(providerId, modelId);
  if (!base) return null;
  const meta = getModelMetadata(providerId, modelId);
  const rm = meta?.rateMultiplier;
  if (rm == null || rm === 1) return base;
  const scale = (v) => (typeof v === "number" ? Number((v * rm).toFixed(6)) : v);
  return {
    ...base,
    input: scale(base.input),
    output: scale(base.output),
    cached: scale(base.cached),
    reasoning: scale(base.reasoning),
    cache_creation: scale(base.cache_creation),
    rateMultiplier: rm,
  };
}

/**
 * One-call full info: metadata + registry + pricing.
 * @returns {{ id, name, contextWindow, vision, reasoning, toolCalling, pricing }|null}
 */
export function getModelFullInfo(providerId, modelId) {
  const meta = getModelMetadata(providerId, modelId);
  if (!meta) return null;
  return {
    ...meta,
    pricing: getModelPricing(providerId, modelId),
  };
}
