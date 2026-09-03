import {
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_CAVEMAN_CONFIG,
  DEFAULT_RTK_CONFIG,
  DEFAULT_COMPRESSION_LANGUAGE_CONFIG
} from "./types.js";
import {
  countTextTokens,
  isCodexTokenizerContext,
  tokenizerContextFromBody
} from "../../utils/omni/tiktokenCounter.js";
import {
  anthropicImageTokens,
  ANTHROPIC_IMAGE_BLOCK_OVERHEAD_TOKENS,
  openAIVisionTokens
} from "../../utils/omni/omniglyphShim.js";
const CHARS_PER_TOKEN = 4;
function isAnthropicPngImageBlock(value) {
  if (!value || typeof value !== "object") return false;
  const block = value;
  if (block.type !== "image") return false;
  const source = block.source;
  if (!source || typeof source !== "object") return false;
  return source.type === "base64" && source.media_type === "image/png" && typeof source.data === "string";
}
function isOpenAIChatPngImagePart(value) {
  if (!value || typeof value !== "object") return false;
  const part = value;
  const image = part.image_url;
  return part.type === "image_url" && !!image && typeof image === "object" && typeof image.url === "string" && image.url.startsWith("data:image/png;base64,");
}
function isOpenAIResponsesPngImagePart(value) {
  const part = value;
  return !!part && part.type === "input_image" && typeof part.image_url === "string" && part.image_url.startsWith("data:image/png;base64,");
}
function pngDimensionsFromDataUrl(value) {
  const marker = ";base64,";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodePngDimensions(value.slice(markerIndex + marker.length));
}
function decodePngDimensions(base64) {
  try {
    const prefix = base64.slice(0, 64);
    const bytes = Buffer.from(prefix, "base64");
    if (bytes.length < 24) return null;
    const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) return null;
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}
function charTokensOf(value) {
  if (value === null || value === void 0) return 0;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(str.length / CHARS_PER_TOKEN);
}
function blankImageBlocksAndSumImageTokens(body) {
  let imageTokens = 0;
  const model = typeof body.model === "string" ? body.model : "";
  const clone = { ...body };
  const processContentArray = (content) => {
    if (!Array.isArray(content)) return content;
    return content.map((block) => {
      if (isAnthropicPngImageBlock(block)) {
        const dims = decodePngDimensions(block.source.data);
        if (!dims) return block;
        imageTokens += anthropicImageTokens(dims.width, dims.height, "standard");
        imageTokens += ANTHROPIC_IMAGE_BLOCK_OVERHEAD_TOKENS;
        return { ...block, source: { ...block.source, data: "" } };
      }
      if (isOpenAIChatPngImagePart(block)) {
        const dims = pngDimensionsFromDataUrl(block.image_url.url);
        if (!dims) return block;
        imageTokens += openAIVisionTokens(model, dims.width, dims.height);
        return { ...block, image_url: { ...block.image_url, url: "" } };
      }
      if (isOpenAIResponsesPngImagePart(block)) {
        const dims = pngDimensionsFromDataUrl(block.image_url);
        if (!dims) return block;
        imageTokens += openAIVisionTokens(model, dims.width, dims.height);
        return { ...block, image_url: "" };
      }
      return block;
    });
  };
  if (Array.isArray(clone.messages)) {
    clone.messages = clone.messages.map((message) => {
      if (!message || typeof message !== "object") return message;
      const m = message;
      if (!Array.isArray(m.content)) return message;
      return { ...m, content: processContentArray(m.content) };
    });
  }
  if (Array.isArray(clone.system)) {
    clone.system = processContentArray(clone.system);
  }
  if (Array.isArray(clone.input)) {
    clone.input = clone.input.map((item) => {
      if (!item || typeof item !== "object") return item;
      const record = item;
      return Array.isArray(record.content) ? { ...record, content: processContentArray(record.content) } : record;
    });
  }
  return { clone, imageTokens };
}
function estimateCompressionTokens(text) {
  if (!text) return 0;
  if (typeof text === "string") {
    return charTokensOf(text);
  }
  try {
    const tokenizerContext = tokenizerContextFromBody(text);
    const useExactTokenizer = isCodexTokenizerContext(tokenizerContext);
    const { clone, imageTokens } = blankImageBlocksAndSumImageTokens(
      text
    );
    if (imageTokens === 0) {
      return useExactTokenizer ? countTextTokens(JSON.stringify(text), tokenizerContext) : charTokensOf(text);
    }
    return useExactTokenizer ? countTextTokens(JSON.stringify(clone), tokenizerContext) + imageTokens : charTokensOf(clone) + imageTokens;
  } catch {
    return charTokensOf(text);
  }
}
function createCompressionStats(originalBody, compressedBody, mode, techniquesUsed, rulesApplied, durationMs) {
  const originalTokens = estimateCompressionTokens(originalBody);
  const compressedTokens = estimateCompressionTokens(compressedBody);
  const savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100 : 0;
  return {
    originalTokens,
    compressedTokens,
    savingsPercent,
    techniquesUsed,
    mode,
    timestamp: Date.now(),
    ...rulesApplied && rulesApplied.length > 0 ? { rulesApplied } : {},
    ...durationMs !== void 0 ? { durationMs } : {}
  };
}
function trackCompressionStats(stats) {
  if (stats.originalTokens <= 0) return;
  const rulesInfo = stats.rulesApplied?.length ? ` rules=${stats.rulesApplied.join(",")}` : "";
  const durationInfo = stats.durationMs !== void 0 ? ` ${stats.durationMs}ms` : "";
}
function getDefaultCompressionConfig() {
  return {
    ...DEFAULT_COMPRESSION_CONFIG,
    cavemanConfig: { ...DEFAULT_CAVEMAN_CONFIG },
    rtkConfig: { ...DEFAULT_RTK_CONFIG },
    languageConfig: { ...DEFAULT_COMPRESSION_LANGUAGE_CONFIG }
  };
}
export {
  createCompressionStats,
  estimateCompressionTokens,
  getDefaultCompressionConfig,
  trackCompressionStats
};
