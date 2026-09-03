import { extractPreservedBlocks } from "./preservation.js";
import { validateCompression } from "./validation.js";
import { scoreToken } from "./ultraHeuristic.js";
const DEFAULT_MAX_PREVIEW_DIFF_TOKEN_PRODUCT = 1e6;
function tokenize(text) {
  return text.match(/\s+|[^\s]+/g) ?? [];
}
function getDiffSkipWarning(original, compressed, options = {}) {
  const maxTokenProduct = options.maxTokenProduct ?? DEFAULT_MAX_PREVIEW_DIFF_TOKEN_PRODUCT;
  if (maxTokenProduct <= 0) return null;
  const originalTokens = tokenize(original).length;
  const compressedTokens = tokenize(compressed).length;
  if (originalTokens * compressedTokens <= maxTokenProduct) return null;
  return `Preview diff omitted because token product ${originalTokens}x${compressedTokens} exceeds safe limit ${maxTokenProduct}.`;
}
function buildCompressionDiff(original, compressed) {
  const a = tokenize(original);
  const b = tokenize(compressed);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i2 = a.length - 1; i2 >= 0; i2--) {
    for (let j2 = b.length - 1; j2 >= 0; j2--) {
      dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const segments = [];
  const push = (type, text) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last?.type === type) {
      last.text += text;
    } else {
      segments.push({ type, text });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("removed", a[i]);
      i++;
    } else {
      push("added", b[j]);
      j++;
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return segments;
}
function keptIndicesFromSegments(segments) {
  const keptSet = /* @__PURE__ */ new Set();
  let cursor = 0;
  for (const seg of segments) {
    if (seg.type === "added") continue;
    const segLen = tokenize(seg.text).length;
    if (seg.type === "same") {
      for (let k = 0; k < segLen; k++) keptSet.add(cursor + k);
    }
    cursor += segLen;
  }
  return keptSet;
}
function removedRangesFromSegments(segments) {
  const ranges = [];
  let cursor = 0;
  for (const seg of segments) {
    if (seg.type === "added") continue;
    const segLen = tokenize(seg.text).length;
    if (seg.type === "removed") ranges.push([cursor, cursor + segLen - 1]);
    cursor += segLen;
  }
  return ranges;
}
function buildHeatmap(mode, original, segments) {
  const rawTokens = tokenize(original);
  if (mode === "universal") {
    const keptSet = keptIndicesFromSegments(segments);
    return {
      mode,
      tokens: rawTokens.map((text, idx) => {
        const kept = keptSet.has(idx);
        return { text, score: kept ? 1 : 0, kept };
      })
    };
  }
  const removedRanges = removedRangesFromSegments(segments);
  return {
    mode,
    tokens: rawTokens.map((text, idx) => {
      const removed = removedRanges.some(([lo, hi]) => idx >= lo && idx <= hi);
      return { text, score: scoreToken(text), kept: !removed };
    })
  };
}
function buildCompressionPreviewDiff(original, compressed, stats, options = {}, heatmapMode) {
  const validation = validateCompression(original, compressed);
  const preserved = extractPreservedBlocks(original).blocks.map((block) => ({
    kind: block.kind,
    preview: block.content.replace(/\s+/g, " ").slice(0, 120)
  }));
  const diffSkipWarning = getDiffSkipWarning(original, compressed, options);
  const segments = diffSkipWarning ? [{ type: "same", text: "[diff omitted: input too large]" }] : buildCompressionDiff(original, compressed);
  let fallbackReason;
  if (validation.fallbackApplied) {
    fallbackReason = validation.errors.length > 0 ? `validation-failed: ${validation.errors[0]}` : "validation-failed";
  } else if (stats?.fallbackApplied) {
    fallbackReason = "compression-fallback";
  }
  const result = {
    segments,
    preservedBlocks: preserved,
    ruleRemovals: stats?.rulesApplied ?? [],
    validationWarnings: [
      ...stats?.validationWarnings ?? [],
      ...validation.warnings,
      ...diffSkipWarning ? [diffSkipWarning] : []
    ],
    validationErrors: [...stats?.validationErrors ?? [], ...validation.errors],
    fallbackApplied: Boolean(stats?.fallbackApplied || validation.fallbackApplied),
    ...fallbackReason && { fallbackReason }
  };
  if (heatmapMode) {
    result.heatmap = buildHeatmap(heatmapMode, original, segments);
  }
  return result;
}
export {
  DEFAULT_MAX_PREVIEW_DIFF_TOKEN_PRODUCT,
  buildCompressionDiff,
  buildCompressionPreviewDiff
};
