import { pruneByScore } from "./ultraHeuristic.js";
import { extractPreservedBlocks } from "./preservation.js";
import { DEFAULT_ULTRA_CONFIG } from "./types.js";
import { extractTextContent, mapTextContent } from "./messageContent.js";
import {
  slmAvailable,
  runLlmlinguaUltra,
  prewarmLlmlinguaUltra
} from "./engines/llmlingua/ultraEntry.js";
const COMPRESSED_PREFIX = "[COMPRESSED:";
async function mapTextContentAsync(msg, fn) {
  if (typeof msg.content === "string") {
    return { ...msg, content: await fn(msg.content) };
  }
  if (Array.isArray(msg.content)) {
    const next = [];
    for (const part of msg.content) {
      const p = part;
      if (p && p["type"] === "text" && typeof p["text"] === "string") {
        next.push({ ...p, text: await fn(p["text"]) });
      } else {
        next.push(part);
      }
    }
    return { ...msg, content: next };
  }
  return msg;
}
function pruneProseOnly(text, rate, minScore) {
  const { text: withPlaceholders, blocks } = extractPreservedBlocks(text);
  if (blocks.length === 0) return pruneByScore(text, rate, minScore);
  const placeholderToContent = new Map(blocks.map((b) => [b.placeholder, b.content]));
  const escaped = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitRe = new RegExp(`(${escaped.join("|")})`, "g");
  return withPlaceholders.split(splitRe).map((part) => {
    if (!part) return "";
    const preserved = placeholderToContent.get(part);
    if (preserved !== void 0) return preserved;
    return pruneByScore(part, rate, minScore);
  }).join("");
}
async function compressProseSlm(text, cfg) {
  const { text: withPlaceholders, blocks } = extractPreservedBlocks(text);
  if (blocks.length === 0) {
    return slmOrHeuristic(text, cfg);
  }
  const placeholderToContent = new Map(blocks.map((b) => [b.placeholder, b.content]));
  const escaped = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitRe = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = withPlaceholders.split(splitRe);
  const out = [];
  let usedSlm = false;
  for (const part of parts) {
    if (!part) {
      out.push("");
      continue;
    }
    const preserved = placeholderToContent.get(part);
    if (preserved !== void 0) {
      out.push(preserved);
    } else {
      const seg = await slmOrHeuristic(part, cfg);
      out.push(seg.text);
      if (seg.usedSlm) usedSlm = true;
    }
  }
  return { text: out.join(""), usedSlm };
}
async function slmOrHeuristic(prose, cfg) {
  try {
    const text = await runLlmlinguaUltra(prose, {
      model: cfg.modelPath ? void 0 : void 0,
      compressionRate: cfg.compressionRate,
      modelPath: cfg.modelPath
    });
    return { text, usedSlm: true };
  } catch {
    return { text: pruneByScore(prose, cfg.compressionRate, cfg.minScoreThreshold), usedSlm: false };
  }
}
function ultraCompressHeuristic(messages, config = {}, tier = "heuristic") {
  const start = Date.now();
  const effectiveConfig = {
    ...DEFAULT_ULTRA_CONFIG,
    ...config
  };
  const { compressionRate, minScoreThreshold, maxTokensPerMessage } = effectiveConfig;
  let originalChars = 0;
  let compressedChars = 0;
  const compressed = messages.map((msg) => {
    if (effectiveConfig.preserveSystemPrompt !== false && msg.role === "system") return msg;
    const text = extractTextContent(msg.content);
    if (!text) return msg;
    if (text.startsWith(COMPRESSED_PREFIX)) return msg;
    if (maxTokensPerMessage > 0 && Math.ceil(text.length / 4) <= maxTokensPerMessage) {
      return msg;
    }
    let messageOriginalChars = 0;
    let messageCompressedChars = 0;
    const next = mapTextContent(msg, (textPart) => {
      if (!textPart || textPart.startsWith(COMPRESSED_PREFIX)) return textPart;
      messageOriginalChars += textPart.length;
      const pruned = pruneProseOnly(textPart, compressionRate, minScoreThreshold);
      messageCompressedChars += pruned.length;
      return pruned;
    });
    originalChars += messageOriginalChars;
    compressedChars += messageCompressedChars;
    return next;
  });
  const originalTokens = Math.ceil(originalChars / 4);
  const compressedTokens = Math.ceil(compressedChars / 4);
  const savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 100 * 10) / 10 : 0;
  const stats = {
    originalTokens,
    compressedTokens,
    savingsPercent,
    techniquesUsed: ["ultra-heuristic-pruning"],
    mode: "ultra",
    timestamp: Date.now(),
    durationMs: Date.now() - start,
    ultraTier: tier
  };
  return { messages: compressed, stats };
}
async function ultraCompress(messages, config = {}) {
  if (config.ultraEngine !== "slm" || !slmAvailable()) {
    return ultraCompressHeuristic(messages, config, "heuristic");
  }
  const start = Date.now();
  const effectiveConfig = { ...DEFAULT_ULTRA_CONFIG, ...config };
  const { maxTokensPerMessage } = effectiveConfig;
  let originalChars = 0;
  let compressedChars = 0;
  let anySlm = false;
  try {
    const compressed = [];
    for (const msg of messages) {
      if (effectiveConfig.preserveSystemPrompt !== false && msg.role === "system") {
        compressed.push(msg);
        continue;
      }
      const text = extractTextContent(msg.content);
      if (!text || text.startsWith(COMPRESSED_PREFIX)) {
        compressed.push(msg);
        continue;
      }
      if (maxTokensPerMessage > 0 && Math.ceil(text.length / 4) <= maxTokensPerMessage) {
        compressed.push(msg);
        continue;
      }
      let messageOriginalChars = 0;
      let messageCompressedChars = 0;
      const next = await mapTextContentAsync(msg, async (textPart) => {
        if (!textPart || textPart.startsWith(COMPRESSED_PREFIX)) return textPart;
        messageOriginalChars += textPart.length;
        const { text: out, usedSlm } = await compressProseSlm(textPart, effectiveConfig);
        if (usedSlm) anySlm = true;
        messageCompressedChars += out.length;
        return out;
      });
      originalChars += messageOriginalChars;
      compressedChars += messageCompressedChars;
      compressed.push(next);
    }
    const originalTokens = Math.ceil(originalChars / 4);
    const compressedTokens = Math.ceil(compressedChars / 4);
    const savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 100 * 10) / 10 : 0;
    const stats = {
      originalTokens,
      compressedTokens,
      savingsPercent,
      techniquesUsed: anySlm ? ["ultra-slm"] : ["ultra-heuristic-pruning"],
      mode: "ultra",
      timestamp: Date.now(),
      durationMs: Date.now() - start,
      ultraTier: anySlm ? "slm" : "heuristic-fallback"
    };
    return { messages: compressed, stats };
  } catch {
    return ultraCompressHeuristic(messages, config, "heuristic-fallback");
  }
}
function shouldPrewarmUltraSlm(config) {
  return config.ultraEngine === "slm" && config.ultraSlmPrewarm === true;
}
async function maybePrewarmUltraSlmOnConfig(config) {
  if (!shouldPrewarmUltraSlm(config)) return;
  try {
    await prewarmLlmlinguaUltra();
  } catch {
  }
}
export {
  maybePrewarmUltraSlmOnConfig,
  shouldPrewarmUltraSlm,
  ultraCompress,
  ultraCompressHeuristic
};
