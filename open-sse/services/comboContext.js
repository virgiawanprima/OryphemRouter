// comboContext — effective context-length computation for a combo (OmniRoute port).
//
// Resolution order:
//   1. Explicit `context_length` on the combo record (user override).
//   2. Minimum of member-model effective context windows from canonical model
//      metadata (MODEL_METADATA → GENERATED_METADATA → registry), counting only
//      members with a known positive window.
//
// Returns undefined when no known context window can be determined.

import { getModelMetadata } from "../providers/models/getMetadata.js";

function isPositiveFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Parse a combo member string ("provider/model" or bare "model") → [provider, model]. */
function parseMember(entry) {
  if (typeof entry !== "string" || !entry) return [null, null];
  const idx = entry.indexOf("/");
  if (idx < 0) return [null, entry];
  return [entry.slice(0, idx), entry.slice(idx + 1)];
}

/**
 * Resolve a combo member's effective context window from canonical metadata.
 * @param {unknown} entry - combo member (model string or ComboStep-like object)
 * @returns {number|undefined}
 */
export function memberContextWindow(entry) {
  let provider = null;
  let model = null;
  if (typeof entry === "string") {
    [provider, model] = parseMember(entry);
  } else if (entry && typeof entry === "object") {
    model = typeof entry.model === "string" ? entry.model : null;
    provider = typeof entry.provider === "string" ? entry.provider : null;
  }
  if (!model) return undefined;
  const meta = getModelMetadata(provider, model);
  const window = meta?.contextWindow ?? meta?.contextLength;
  return isPositiveFiniteNumber(window) ? window : undefined;
}

/**
 * Compute the effective context-length for a combo.
 * @param {{models?: unknown[], context_length?: number}} combo
 * @returns {number|undefined}
 */
export function computeComboContextLength(combo) {
  if (!combo) return undefined;
  if (isPositiveFiniteNumber(combo.context_length)) return combo.context_length;
  const models = Array.isArray(combo.models) ? combo.models : [];
  const windows = models.map(memberContextWindow).filter(isPositiveFiniteNumber);
  return windows.length > 0 ? Math.min(...windows) : undefined;
}
