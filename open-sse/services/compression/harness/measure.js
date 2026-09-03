import { estimateCompressionTokens } from "../stats.js";
import { extractPreservedBlocks } from "../preservation.js";
const RETENTION_KINDS = /* @__PURE__ */ new Set([
  "url",
  "markdown_link",
  "const_case",
  "env_var",
  "version",
  "dotted_identifier",
  "function_call",
  "file_path",
  "error_message",
  "inline_code"
]);
function extractEntities(text) {
  const { blocks } = extractPreservedBlocks(text);
  const set = /* @__PURE__ */ new Set();
  for (const block of blocks) {
    if (RETENTION_KINDS.has(block.kind)) {
      const content = block.content.trim();
      if (content) set.add(content);
    }
  }
  return [...set];
}
function computeRetention(original, compressed) {
  const entities = extractEntities(original);
  if (entities.length === 0) {
    return { total: 0, survived: 0, score: 1, lost: [] };
  }
  if (compressed === original) {
    return { total: entities.length, survived: entities.length, score: 1, lost: [] };
  }
  const lost = [];
  let survived = 0;
  for (const entity of entities) {
    if (compressed.includes(entity)) survived++;
    else lost.push(entity);
  }
  return {
    total: entities.length,
    survived,
    score: survived / entities.length,
    lost
  };
}
function measureCompression(original, compressed) {
  const originalTokens = estimateCompressionTokens(original);
  const compressedTokens = estimateCompressionTokens(compressed);
  const savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e3) / 10 : 0;
  return {
    originalTokens,
    compressedTokens,
    savingsPercent,
    retention: computeRetention(original, compressed)
  };
}
export {
  computeRetention,
  extractEntities,
  measureCompression
};
