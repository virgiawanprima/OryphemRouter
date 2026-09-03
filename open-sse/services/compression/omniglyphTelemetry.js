import {
  normalizeAccounting
} from "../../utils/omni/omniglyphShim.js";
function toAccountingProvider(provider) {
  const normalized = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (normalized === "anthropic" || normalized === "claude") return "anthropic";
  if (normalized === "openai" || normalized === "codex" || normalized === "chatgpt") {
    return "openai";
  }
  if (normalized === "xai" || normalized === "grok") return "xai";
  return "unknown";
}
function count(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function buildOmniGlyphAccounting(params) {
  const { info } = params;
  const provider = toAccountingProvider(params.provider);
  const normalized = normalizeAccounting({
    provider,
    ...params.model ? { model: params.model } : {},
    originalBytes: params.originalBytes,
    transformedBytes: params.transformedBytes,
    ...count(info?.baselineImagedTokens) !== void 0 ? { estimatedOriginalInputTokens: info.baselineImagedTokens } : {},
    ...count(info?.imageTokens) !== void 0 ? { estimatedTransformedInputTokens: info.imageTokens } : {},
    ...count(info?.imageTokens) !== void 0 ? { imageTokens: info.imageTokens } : {},
    ...params.durationMs !== void 0 ? { proxyAddedLatencyMs: params.durationMs } : {}
  });
  const chars = {
    ...count(info?.origChars) !== void 0 ? { original: info.origChars } : {},
    ...count(info?.compressedChars) !== void 0 ? { imaged: info.compressedChars } : {},
    ...count(info?.staticChars) !== void 0 ? { static: info.staticChars } : {},
    ...count(info?.dynamicChars) !== void 0 ? { dynamic: info.dynamicChars } : {},
    ...count(info?.outgoingTextChars) !== void 0 ? { outgoingText: info.outgoingTextChars } : {}
  };
  return {
    provider: normalized.provider,
    ...normalized.model ? { model: normalized.model } : {},
    bytes: normalized.bytes,
    tokens: {
      ...normalized.tokens.estimatedOriginalInput !== void 0 ? { estimatedOriginalInput: normalized.tokens.estimatedOriginalInput } : {},
      ...normalized.tokens.estimatedActualInput !== void 0 ? { estimatedActualInput: normalized.tokens.estimatedActualInput } : {},
      ...normalized.tokens.estimatedReduced !== void 0 ? { estimatedReduced: normalized.tokens.estimatedReduced } : {},
      ...normalized.tokens.image !== void 0 ? { image: normalized.tokens.image } : {}
    },
    savings: normalized.savings,
    images: {
      count: count(info?.imageCount) ?? 0,
      bytes: count(info?.imageBytes) ?? 0,
      ...count(info?.imagePixels) !== void 0 ? { pixels: info.imagePixels } : {}
    },
    chars,
    ...count(info?.dynamicBlockCount) !== void 0 ? { dynamicBlockCount: info.dynamicBlockCount } : {},
    ...normalized.latency.proxyAddedMs !== void 0 ? { latencyMs: normalized.latency.proxyAddedMs } : {}
  };
}
export {
  buildOmniGlyphAccounting,
  toAccountingProvider
};
