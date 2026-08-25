// Lookup helper for model metadata.
//
// Resolution order:
//   1. MODEL_METADATA (enriched metadata in ./metadata.js)
//   2. Registry entry (fallback — raw `{ id, name, ... }` from ../registry/*.js)
//   3. null (unknown model)
import REGISTRY from "../registry/index.js";
import { MODEL_METADATA } from "./metadata.js";

export function getModelMetadata(providerId, modelId) {
  if (MODEL_METADATA[modelId] !== undefined) {
    return MODEL_METADATA[modelId];
  }

  // Fallback: surface the raw registry entry so callers still get id/name and
  // any provider-declared fields, even without enriched metadata.
  const provider = REGISTRY.find((p) => p.id === providerId);
  const entry = provider?.models?.find((m) => (typeof m === "string" ? m : m.id) === modelId);
  if (entry !== undefined) {
    return typeof entry === "string" ? { id: entry } : entry;
  }

  return null;
}
