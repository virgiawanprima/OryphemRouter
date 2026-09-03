// ADAPTATION for OryphemRouter.
// OmniRoute's `src/shared/utils/tiktokenCounter.ts` wraps the `js-tiktoken` npm package.
// That package is not installed here. This shim implements a lightweight heuristic token
// counter (≈ chars/4, whitespace-aware) as a graceful fallback so the compression
// subsystem loads and remains functional. NOTE: counts are heuristic estimates, not exact
// BPE tokenizer output.

const TIKTOKEN_CACHE = new Map();

export function countTokens(text) {
  if (text === undefined || text === null) return 0;
  const str = String(text);
  if (TIKTOKEN_CACHE.has(str)) return TIKTOKEN_CACHE.get(str);
  let tokens = 0;
  let ascii = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) ascii += 1;
  }
  tokens = Math.ceil(ascii / 4 + (str.length - ascii));
  if (tokens < 1) tokens = 1;
  if (TIKTOKEN_CACHE.size > 10_000) TIKTOKEN_CACHE.clear();
  TIKTOKEN_CACHE.set(str, tokens);
  return tokens;
}

const BASE64_DATA_URI_RE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

function stripBase64DataUris(text) {
  return text.replace(BASE64_DATA_URI_RE, "");
}

/** Exact-counting API (heuristic fallback): strips base64 data URIs, counts chars/4. */
export function countTextTokens(text, context) {
  if (!text || typeof text !== "string") return 0;
  const stripped = stripBase64DataUris(text);
  return Math.ceil(stripped.length / 4) || 0;
}

export function tokenizerContextFromBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return {
    provider: typeof body.provider === "string" ? body.provider : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
  };
}

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isCodexTokenizerContext(context) {
  const provider = normalize(context?.provider);
  const model = normalize(context?.model);
  return (
    provider === "codex" ||
    provider === "cx" ||
    model.startsWith("codex/") ||
    model.startsWith("cx/") ||
    model.includes("codex")
  );
}

export function resolveTokenizerEncoding(context) {
  return isCodexTokenizerContext(context) ? "o200k_base" : "cl100k_base";
}

export function getTiktokenEncoding() {
  return null;
}

export function createTiktokenCounter(model) {
  return countTokens;
}
