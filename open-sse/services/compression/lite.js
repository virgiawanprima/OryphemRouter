import { isVisionModelId } from "../../utils/visionModels.js";
import { createCompressionStats } from "./stats.js";
function normalizeMessageWhitespace(content) {
  if (!content) return "";
  return content.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "");
}
function modelSupportsVision(model) {
  return isVisionModelId(model);
}
function collapseWhitespace(body, options = {}) {
  if (!body.messages) return { body, applied: false };
  let applied = false;
  const messages = body.messages.map((msg) => {
    if (options.preserveSystemPrompt === true && msg.role === "system") return msg;
    if (typeof msg.content !== "string") return msg;
    const normalized = normalizeMessageWhitespace(msg.content);
    if (normalized !== msg.content) applied = true;
    return { ...msg, content: normalized };
  });
  return { body: { ...body, messages }, applied };
}
function dedupSystemPrompt(body, options = {}) {
  if (!body.messages) return { body, applied: false };
  if (options.preserveSystemPrompt === true) return { body, applied: false };
  const seen = /* @__PURE__ */ new Set();
  let applied = false;
  const messages = body.messages.filter((msg) => {
    if (msg.role !== "system" || typeof msg.content !== "string") return true;
    const key = msg.content.trim().slice(0, 200);
    if (seen.has(key)) {
      applied = true;
      return false;
    }
    seen.add(key);
    return true;
  });
  return { body: { ...body, messages }, applied };
}
const TOOL_TRUNCATION_LOOKBACK = 80;
function isWordChar(char) {
  return char !== void 0 && /\S/.test(char);
}
function findWhitespaceBackward(content, cutIndex) {
  const windowStart = Math.max(0, cutIndex - TOOL_TRUNCATION_LOOKBACK);
  for (let i = cutIndex; i > windowStart; i--) {
    if (!isWordChar(content[i - 1])) return i - 1;
  }
  return -1;
}
function findWhitespaceForward(content, cutIndex) {
  const windowEnd = Math.min(content.length, cutIndex + TOOL_TRUNCATION_LOOKBACK);
  for (let i = cutIndex; i < windowEnd; i++) {
    if (!isWordChar(content[i])) return i;
  }
  return -1;
}
function backOffToWordBoundary(content, cutIndex) {
  const onWordBoundary = !isWordChar(content[cutIndex - 1]) || !isWordChar(content[cutIndex]);
  if (onWordBoundary) return cutIndex;
  const backward = findWhitespaceBackward(content, cutIndex);
  if (backward !== -1) return backward;
  const forward = findWhitespaceForward(content, cutIndex);
  if (forward !== -1) return forward;
  return cutIndex;
}
function compressToolResults(body) {
  if (!body.messages) return { body, applied: false };
  const MAX_TOOL_LENGTH = 2e3;
  let applied = false;
  const messages = body.messages.map((msg) => {
    if (msg.role !== "tool" || typeof msg.content !== "string") return msg;
    if (msg.content.length <= MAX_TOOL_LENGTH) return msg;
    applied = true;
    const cutIndex = backOffToWordBoundary(msg.content, MAX_TOOL_LENGTH);
    return {
      ...msg,
      content: msg.content.slice(0, cutIndex) + "\n...[truncated]"
    };
  });
  return { body: { ...body, messages }, applied };
}
function removeRedundantContent(body, options = {}) {
  if (!body.messages) return { body, applied: false };
  let applied = false;
  const messages = [];
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (options.preserveSystemPrompt === true && msg.role === "system") {
      messages.push(msg);
      continue;
    }
    const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    if (i > 0 && body.messages[i - 1].role === msg.role && typeof body.messages[i - 1].content === "string" && body.messages[i - 1].content === contentStr) {
      applied = true;
      continue;
    }
    messages.push(msg);
  }
  return { body: { ...body, messages }, applied };
}
function replaceImageUrls(body, options) {
  if (!body.messages) return { body, applied: false };
  const supportsVision = typeof options === "object" && options !== null ? options.supportsVision : typeof options === "string" ? modelSupportsVision(options) : void 0;
  if (supportsVision !== false) return { body, applied: false };
  let applied = false;
  const messages = body.messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    const newContent = msg.content.map((part) => {
      if (typeof part === "object" && part !== null && part.type === "image_url" && typeof part.image_url === "object" && part.image_url?.url) {
        const url = String(
          part.image_url.url
        );
        if (url.startsWith("data:image/")) {
          applied = true;
          const format = url.slice(url.indexOf("/") + 1, url.indexOf(";")) || "unknown";
          return { type: "text", text: `[image: ${format}]` };
        }
      }
      return part;
    });
    return { ...msg, content: newContent };
  });
  return { body: { ...body, messages }, applied };
}
function applyLiteCompression(body, options) {
  const originalBody = body;
  let current = body;
  const techniquesApplied = [];
  const r1 = collapseWhitespace(current, options);
  current = r1.body;
  if (r1.applied) techniquesApplied.push("whitespace");
  const r2 = dedupSystemPrompt(current, options);
  current = r2.body;
  if (r2.applied) techniquesApplied.push("system-dedup");
  if (options?.compressToolResults !== false) {
    const r3 = compressToolResults(current);
    current = r3.body;
    if (r3.applied) techniquesApplied.push("tool-compress");
  }
  const r4 = removeRedundantContent(current, options);
  current = r4.body;
  if (r4.applied) techniquesApplied.push("redundant-remove");
  const r5 = replaceImageUrls(current, options);
  current = r5.body;
  if (r5.applied) techniquesApplied.push("image-placeholder");
  const compressed = techniquesApplied.length > 0;
  const stats = compressed ? createCompressionStats(
    originalBody,
    current,
    "lite",
    techniquesApplied
  ) : null;
  return {
    body: current,
    compressed,
    stats
  };
}
export {
  applyLiteCompression,
  collapseWhitespace,
  compressToolResults,
  dedupSystemPrompt,
  removeRedundantContent,
  replaceImageUrls
};
