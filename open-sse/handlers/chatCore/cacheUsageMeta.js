function toPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
function buildCacheUsageLogMeta(usage) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokenDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object" ? usage.prompt_tokens_details : void 0;
  const hasCacheFields = "cache_read_input_tokens" in usage || "cached_tokens" in usage || "cache_creation_input_tokens" in usage || !!promptTokenDetails && ("cached_tokens" in promptTokenDetails || "cache_creation_tokens" in promptTokenDetails);
  const cacheReadTokens = toPositiveNumber(
    usage.cache_read_input_tokens ?? usage.cached_tokens ?? promptTokenDetails?.cached_tokens
  );
  const cacheCreationTokens = toPositiveNumber(
    usage.cache_creation_input_tokens ?? promptTokenDetails?.cache_creation_tokens
  );
  if (!hasCacheFields) return null;
  return {
    cacheReadTokens,
    cacheCreationTokens
  };
}
function attachLogMeta(payload, meta) {
  if (!meta || typeof meta !== "object") return payload;
  const compactMeta = Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== null && value !== void 0)
  );
  if (Object.keys(compactMeta).length === 0) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { _omniroute: compactMeta, _payload: payload ?? null };
  }
  const existing = payload._omniroute && typeof payload._omniroute === "object" && !Array.isArray(payload._omniroute) ? payload._omniroute : {};
  return {
    ...payload,
    _omniroute: {
      ...existing,
      ...compactMeta
    }
  };
}
export {
  attachLogMeta,
  buildCacheUsageLogMeta,
  toPositiveNumber
};
