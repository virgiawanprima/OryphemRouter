// ADAPTATION for OryphemRouter.
// OmniRoute's compression subsystem imports the `omniglyph` npm package (and its
// `omniglyph/applicability` submodule) for an LLM-glyph image-compression engine. That
// package is not installed in OryphemRouter. This shim provides graceful no-op fallbacks so
// `compression/engines/omniglyphAdapter.js`, `compression/omniglyphTelemetry.js` and
// `compression/stats.js` load without the dependency. The engine effectively reports
// "unsupported / not available" and is skipped at runtime.

export const OmniglyphEncoder = null;

export function createEncoder() {
  return null;
}

export function isOmniglyphAvailable() {
  return false;
}

export function encode(input) {
  return { ok: false, error: "omniglyph not available (not installed)" };
}

export function decode(input) {
  return { ok: false, error: "omniglyph not available (not installed)" };
}

// ── omniglyph (main) named exports used by omniglyphAdapter ────────────────
export function isOmniGlyphSupportedModelForScope() {
  return false;
}

export function mergeCompressionProfileOptions(a, b) {
  return { ...(a ?? {}), ...(b ?? {}) };
}

export function resolveCompressionProfile(profile) {
  return profile ?? {};
}

export function transformAnthropicMessages(input) {
  return { unsupported: true, reason: "omniglyph not available (not installed)" };
}

export function transformOpenAIChatCompletions(input) {
  return { unsupported: true, reason: "omniglyph not available (not installed)" };
}

export function transformOpenAIResponses(input) {
  return { unsupported: true, reason: "omniglyph not available (not installed)" };
}

// ── omniglyph/applicability ─────────────────────────────────────────────────
export function isModelImageable() {
  return false;
}

// ── Image-token accounting helpers (used by compression/stats.js) ───────────
/** Anthropic per-image-block token overhead (real omniglyph constant ≈ 1600). */
export const ANTHROPIC_IMAGE_BLOCK_OVERHEAD_TOKENS = 1600;

/** Anthropic image token estimate: (width * height) / 750 for standard size. */
export function anthropicImageTokens(width, height, size = "standard") {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (size === "low") return Math.ceil((w * h) / 750 / 4);
  if (size === "high") return Math.ceil((w * h) / 750 * 2);
  return Math.ceil((w * h) / 750);
}

/** OpenAI vision token estimate: tiles of 512px, 85 tokens/tile + 85 base. */
export function openAIVisionTokens(model, width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const tilesX = Math.ceil(w / 512);
  const tilesY = Math.ceil(h / 512);
  return tilesX * tilesY * 85 + 85;
}

/** Normalize an omniglyph accounting object (no-op pass-through fallback). */
export function normalizeAccounting(accounting) {
  return { ...(accounting ?? {}) };
}

export default { OmniglyphEncoder, createEncoder, isOmniglyphAvailable, encode, decode };
