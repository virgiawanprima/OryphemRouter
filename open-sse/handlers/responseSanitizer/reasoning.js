const REASONING_TAG_NAMES = ["think", "thinking", "thought", "internal_thought"];
const REASONING_TAG_PATTERN = REASONING_TAG_NAMES.join("|");
const THINK_TAG_REGEX = new RegExp(
  `<(${REASONING_TAG_PATTERN})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`,
  "gi"
);
const REASONING_CLOSE_TAG_REGEX = new RegExp(`</(${REASONING_TAG_PATTERN})>`, "i");
const REASONING_TAG_FRAGMENT_REGEX = new RegExp(
  `</?(${REASONING_TAG_PATTERN})\\b[^>]*>`,
  "gi"
);
const CONTENT_OPEN_TAG_REGEX = /<content\b[^>]*>/i;
const UNCLOSED_REASONING_TAG_REGEX = new RegExp(
  `<(${REASONING_TAG_PATTERN})(?:\\s[^>]*)?(?:>|\\r?\\n)([\\s\\S]*)$`,
  "i"
);
const EXCESSIVE_NEWLINES = /\n{2,}/g;
function collapseExcessiveNewlines(text) {
  return text.replace(EXCESSIVE_NEWLINES, "\n\n");
}
function cleanReasoningFragment(text) {
  return text.replace(REASONING_TAG_FRAGMENT_REGEX, "").trim();
}
function splitClosingOnlyReasoningPrefix(text) {
  const closeMatch = text.match(REASONING_CLOSE_TAG_REGEX);
  if (!closeMatch || closeMatch.index === void 0 || closeMatch.index === 0) return null;
  const closeIndex = closeMatch.index;
  const suffix = text.slice(closeIndex + closeMatch[0].length);
  if (!CONTENT_OPEN_TAG_REGEX.test(suffix)) return null;
  const thinking = cleanReasoningFragment(text.slice(0, closeIndex));
  if (!thinking) return null;
  return { content: suffix.trim(), thinking };
}
function movePrefixBeforeContentTagToThinking(cleaned, thinkingParts) {
  const contentMatch = cleaned.match(CONTENT_OPEN_TAG_REGEX);
  if (!contentMatch || contentMatch.index === void 0 || contentMatch.index <= 0) return cleaned;
  const contentIndex = contentMatch.index;
  const prefix = cleanReasoningFragment(cleaned.slice(0, contentIndex));
  if (prefix) thinkingParts.unshift(prefix);
  return cleaned.slice(contentIndex);
}
function extractThinkingFromContent(text) {
  if (!text || typeof text !== "string") {
    return { content: text || "", thinking: null };
  }
  const thinkingParts = [];
  let hasThinkTags = false;
  let cleaned = text.replace(THINK_TAG_REGEX, (_match, _tagName, thinkContent) => {
    hasThinkTags = true;
    const trimmed = thinkContent.trim();
    if (trimmed) {
      thinkingParts.push(trimmed);
    }
    return "";
  });
  if (!hasThinkTags) {
    const closingOnly = splitClosingOnlyReasoningPrefix(cleaned);
    if (closingOnly) {
      return closingOnly;
    }
  }
  const unclosedMatch = cleaned.match(UNCLOSED_REASONING_TAG_REGEX);
  if (unclosedMatch?.index !== void 0) {
    hasThinkTags = true;
    const reasoning = String(unclosedMatch[2] || "").trim();
    if (reasoning) thinkingParts.push(reasoning);
    const prefix = cleaned.slice(0, unclosedMatch.index);
    cleaned = /^(?:\s|§\d+§)*$/.test(prefix) ? "" : prefix;
  }
  if (!hasThinkTags) {
    return { content: text, thinking: null };
  }
  cleaned = movePrefixBeforeContentTagToThinking(cleaned, thinkingParts);
  return {
    content: cleaned.trim(),
    thinking: thinkingParts.length > 0 ? thinkingParts.join("\n\n") : null
  };
}
function normalizeReasoningRouteId(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}
function isAntigravityReasoningRoute(providerId, modelId) {
  return providerId.includes("antigravity") || providerId === "agy" || modelId.includes("antigravity/") || modelId.startsWith("agy/");
}
function isTextualReasoningTagNativeRoute(providerId, modelId) {
  const routeId = `${providerId}/${modelId}`;
  return /deepseek[-_/]?r1\b/.test(routeId) || /r1[-_/]?distill\b/.test(routeId) || /(?:^|[/:_-])qwq(?:[/._:-]|$)/.test(routeId) || /(?:^|[/_-])k3(?:[/._:-]|$)/.test(modelId) || // 9router#2231: MiniMax M3 leaks raw <think>...</think> into `content` on its
  // OpenAI-format provider tiers (trae, huggingchat, bazaarlink, ollama-cloud,
  // opencode, cline, opencode-zen, codebuddy-cn). The direct minimax/minimax-cn
  // tiers stay on Anthropic's Messages format (targetFormat: "claude") and
  // already surface reasoning natively, so they are excluded here.
  providerId !== "minimax" && providerId !== "minimax-cn" && /minimax[-_]?m3\b/.test(routeId);
}
function shouldParseTextualReasoningTags(provider, model) {
  const providerId = normalizeReasoningRouteId(provider);
  const modelId = normalizeReasoningRouteId(model);
  return !isAntigravityReasoningRoute(providerId, modelId) && isTextualReasoningTagNativeRoute(providerId, modelId);
}
export {
  CONTENT_OPEN_TAG_REGEX,
  EXCESSIVE_NEWLINES,
  REASONING_CLOSE_TAG_REGEX,
  REASONING_TAG_FRAGMENT_REGEX,
  REASONING_TAG_NAMES,
  REASONING_TAG_PATTERN,
  THINK_TAG_REGEX,
  UNCLOSED_REASONING_TAG_REGEX,
  cleanReasoningFragment,
  collapseExcessiveNewlines,
  extractThinkingFromContent,
  isAntigravityReasoningRoute,
  isTextualReasoningTagNativeRoute,
  movePrefixBeforeContentTagToThinking,
  normalizeReasoningRouteId,
  shouldParseTextualReasoningTags,
  splitClosingOnlyReasoningPrefix
};
