import { REGISTRY } from "../utils/omni/omniProviderRegistry.js";
import {
  getModelContextLimit
} from "../utils/omni/omniModelCapabilities.js";
import { parseModel } from "./model.js";
import { jsonLength } from "../utils/jsonSize.js";
const DEFAULT_LIMITS = {
  claude: 2e5,
  openai: 128e3,
  gemini: 1e6,
  codex: 4e5,
  // HyperAgent Claude-family agents (fable/opus/sonnet) — 1M default; was falling
  // through to 128k and blocking normal agentic tool loops with huge catalogs.
  hyperagent: 1e6,
  ha: 1e6,
  default: 128e3
};
function getEnvOverride(provider) {
  const envKey = `CONTEXT_LENGTH_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const globalValue = process.env.CONTEXT_LENGTH_DEFAULT;
  if (globalValue) {
    const parsed = parseInt(globalValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}
function getReserveTokensOverride() {
  const envValue = process.env.CONTEXT_RESERVE_TOKENS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}
function getKeepLatestImagesOverride() {
  const envValue = process.env.CONTEXT_KEEP_LATEST_IMAGES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return null;
}
const DEFAULT_KEEP_LATEST_IMAGES = 2;
const IMAGE_REMOVED_PLACEHOLDER = "[Earlier image removed to fit context window]";
const CHARS_PER_TOKEN = 4;
const IMAGE_TOKEN_ESTIMATE = 1200;
const DOCUMENT_TOKEN_ESTIMATE = IMAGE_TOKEN_ESTIMATE;
const INLINE_BASE64_IMAGE_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;
function isInlineBase64ImageUrl(value) {
  return typeof value === "string" && INLINE_BASE64_IMAGE_RE.test(value);
}
function matchesOpenAIImageUrlShape(node) {
  const imageUrl = node.image_url;
  if (isInlineBase64ImageUrl(imageUrl)) return true;
  return !!imageUrl && typeof imageUrl === "object" && isInlineBase64ImageUrl(imageUrl.url);
}
function matchesAiSdkImageShape(node) {
  return node.type === "image" && isInlineBase64ImageUrl(node.image);
}
function matchesClaudeSourceShape(node) {
  if (node.type !== "image") return false;
  const source = node.source;
  if (!source || typeof source !== "object") return false;
  const src = source;
  return src.type === "base64" && typeof src.data === "string";
}
function matchesGeminiInlineDataShape(node) {
  const inlineData = node.inlineData ?? node.inline_data;
  if (!inlineData || typeof inlineData !== "object") return false;
  return typeof inlineData.data === "string";
}
const INLINE_BASE64_DATA_RE = /^data:[^;,]+;base64,/;
function isInlineBase64DataUrl(value) {
  return typeof value === "string" && INLINE_BASE64_DATA_RE.test(value);
}
function matchesOpenAIFileShape(node) {
  if (node.type === "input_file") return isInlineBase64DataUrl(node.file_data);
  if (node.type !== "file") return false;
  const file = node.file;
  if (!file || typeof file !== "object") return false;
  const f = file;
  return isInlineBase64DataUrl(f.file_data) || isInlineBase64DataUrl(f.data);
}
function matchesClaudeDocumentShape(node) {
  if (node.type !== "document") return false;
  const source = node.source;
  if (!source || typeof source !== "object") return false;
  const src = source;
  return src.type === "base64" && typeof src.data === "string";
}
function isInlineBase64DocumentBlock(node) {
  return matchesOpenAIFileShape(node) || matchesClaudeDocumentShape(node);
}
function isInlineBase64ImageBlock(node) {
  return matchesOpenAIImageUrlShape(node) || matchesAiSdkImageShape(node) || matchesClaudeSourceShape(node) || matchesGeminiInlineDataShape(node);
}
function replaceImageBlockWithPlaceholder(block) {
  if (block.type === "input_image") {
    return { type: "input_text", text: IMAGE_REMOVED_PLACEHOLDER };
  }
  if (block.inlineData || block.inline_data) {
    return { text: IMAGE_REMOVED_PLACEHOLDER };
  }
  return { type: "text", text: IMAGE_REMOVED_PLACEHOLDER };
}
function pruneOlderInlineImages(messages, options = {}) {
  const keepLatest = options.keepLatest ?? getKeepLatestImagesOverride() ?? DEFAULT_KEEP_LATEST_IMAGES;
  const targetTokens = options.targetTokens;
  const locations = [];
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const content = messages[messageIndex]?.content;
    if (!Array.isArray(content)) continue;
    for (let contentIndex = 0; contentIndex < content.length; contentIndex++) {
      const part = content[contentIndex];
      if (part && typeof part === "object" && !Array.isArray(part) && isInlineBase64ImageBlock(part)) {
        locations.push({ messageIndex, contentIndex });
      }
    }
  }
  if (locations.length <= keepLatest) {
    return { messages, pruned: 0 };
  }
  const prunable = locations.slice(0, Math.max(0, locations.length - keepLatest));
  const next = messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return { ...message, content: [...message.content] };
  });
  let pruned = 0;
  for (const location of prunable) {
    if (targetTokens != null && estimateTokens(next) <= targetTokens) break;
    const content = next[location.messageIndex].content;
    const block = content[location.contentIndex];
    content[location.contentIndex] = replaceImageBlockWithPlaceholder(block);
    pruned += 1;
  }
  return { messages: next, pruned };
}
function extractImageTokens(node, seen) {
  if (node === null || typeof node !== "object") {
    return { node, tokens: 0 };
  }
  if (seen.has(node)) return { node, tokens: 0 };
  seen.add(node);
  if (Array.isArray(node)) {
    let tokens2 = 0;
    const out2 = node.map((item) => {
      const record2 = item && typeof item === "object" && !Array.isArray(item) ? item : null;
      if (record2 && isInlineBase64ImageBlock(record2)) {
        tokens2 += IMAGE_TOKEN_ESTIMATE;
        return { __image_token_estimate__: IMAGE_TOKEN_ESTIMATE };
      }
      if (record2 && isInlineBase64DocumentBlock(record2)) {
        tokens2 += DOCUMENT_TOKEN_ESTIMATE;
        return { __document_token_estimate__: DOCUMENT_TOKEN_ESTIMATE };
      }
      const result = extractImageTokens(item, seen);
      tokens2 += result.tokens;
      return result.node;
    });
    return { node: out2, tokens: tokens2 };
  }
  const record = node;
  if (isInlineBase64ImageBlock(record)) {
    return {
      node: { __image_token_estimate__: IMAGE_TOKEN_ESTIMATE },
      tokens: IMAGE_TOKEN_ESTIMATE
    };
  }
  if (isInlineBase64DocumentBlock(record)) {
    return {
      node: { __document_token_estimate__: DOCUMENT_TOKEN_ESTIMATE },
      tokens: DOCUMENT_TOKEN_ESTIMATE
    };
  }
  let tokens = 0;
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    const result = extractImageTokens(value, seen);
    out[key] = result.node;
    tokens += result.tokens;
  }
  return { node: out, tokens };
}
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === "string") {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
  const { node, tokens: imageTokens } = extractImageTokens(text, /* @__PURE__ */ new Set());
  return Math.ceil(jsonLength(node) / CHARS_PER_TOKEN) + imageTokens;
}
function getTokenLimit(provider, model = null, snapshot) {
  return resolveTokenLimit(provider, model, snapshot).limit;
}
function getSourcedTokenLimit(provider, model = null, canonicalWindow, snapshot) {
  if (typeof canonicalWindow === "number" && Number.isFinite(canonicalWindow) && canonicalWindow > 0) {
    return canonicalWindow;
  }
  const resolved = resolveTokenLimit(provider, model, snapshot);
  return resolved.specific ? resolved.limit : void 0;
}
function getComboTargetTokenLimit(options) {
  let parsedProvider = options.parsedProvider;
  let parsedModel = options.parsedModel;
  if ((parsedProvider === void 0 || parsedModel === void 0) && Object.prototype.hasOwnProperty.call(options, "modelStr")) {
    const parsed = parseModel(options.modelStr);
    if (parsedProvider === void 0) parsedProvider = parsed.provider;
    if (parsedModel === void 0) parsedModel = parsed.model;
  }
  const provider = parsedProvider ?? options.targetProvider ?? options.provider ?? "unknown";
  return getTokenLimit(provider, parsedModel ?? null);
}
function resolveTokenLimit(provider, model = null, snapshot) {
  const envOverride = getEnvOverride(provider);
  if (envOverride) return { limit: envOverride, specific: true };
  const lowerModel = (model || "").toLowerCase();
  if (model) {
    const dbLimit = getModelContextLimit(provider, model, snapshot);
    if (dbLimit && dbLimit > 0) return { limit: dbLimit, specific: true };
  }
  const registryEntry = REGISTRY[provider];
  if (registryEntry?.defaultContextLength) {
    return { limit: registryEntry.defaultContextLength, specific: true };
  }
  if (model) {
    if (lowerModel.includes("claude")) return { limit: DEFAULT_LIMITS.claude, specific: true };
    if (lowerModel.includes("gemini")) return { limit: DEFAULT_LIMITS.gemini, specific: true };
    if (lowerModel.includes("gpt") || lowerModel.includes("o1") || lowerModel.includes("o3") || lowerModel.includes("o4") || lowerModel.includes("codex"))
      return { limit: DEFAULT_LIMITS.codex, specific: true };
  }
  if (DEFAULT_LIMITS[provider]) return { limit: DEFAULT_LIMITS[provider], specific: true };
  return { limit: DEFAULT_LIMITS.default, specific: false };
}
function resolveComboContextLimit(options) {
  const own = resolveTokenLimit(options.provider, options.model ?? null);
  if (own.specific) {
    return { limit: own.limit, source: "target" };
  }
  const knownTargets = (options.comboTargetLimits || []).filter(
    (value) => Number.isFinite(value) && value > 0
  );
  if (knownTargets.length > 0) {
    return { limit: Math.min(...knownTargets), source: "combo-min" };
  }
  return { limit: own.limit, source: "fallback" };
}
function compressContext(body, options = {}) {
  if (!body || !body.messages || !Array.isArray(body.messages)) {
    return { body, compressed: false, stats: {} };
  }
  const provider = options.provider || "default";
  const maxTokens = options.maxTokens || getTokenLimit(provider, body.model || options.model || null);
  const defaultReserveTokens = Math.min(16e3, Math.max(256, Math.floor(maxTokens * 0.15)));
  const reserveTokens = Math.min(
    options.reserveTokens ?? getReserveTokensOverride() ?? defaultReserveTokens,
    Math.max(0, maxTokens - 1)
  );
  const targetTokens = Math.max(0, maxTokens - reserveTokens);
  let messages = [...body.messages];
  let currentTokens = estimateTokens(messages);
  const stats = { original: currentTokens, layers: [] };
  if (currentTokens <= targetTokens) {
    return { body, compressed: false, stats: { original: currentTokens, final: currentTokens } };
  }
  messages = trimToolMessages(messages, 2e3);
  currentTokens = estimateTokens(messages);
  stats.layers.push({ name: "trim_tools", tokens: currentTokens });
  if (currentTokens <= targetTokens) {
    return {
      body: { ...body, messages },
      compressed: true,
      stats: { ...stats, final: currentTokens }
    };
  }
  const imagePrune = pruneOlderInlineImages(messages, {
    keepLatest: options.keepLatestImages,
    targetTokens
  });
  if (imagePrune.pruned > 0) {
    messages = imagePrune.messages;
    currentTokens = estimateTokens(messages);
    stats.layers.push({ name: "prune_images", tokens: currentTokens });
    if (currentTokens <= targetTokens) {
      return {
        body: { ...body, messages },
        compressed: true,
        stats: { ...stats, final: currentTokens }
      };
    }
  }
  messages = compressThinking(messages);
  currentTokens = estimateTokens(messages);
  stats.layers.push({ name: "compress_thinking", tokens: currentTokens });
  if (currentTokens <= targetTokens) {
    return {
      body: { ...body, messages },
      compressed: true,
      stats: { ...stats, final: currentTokens }
    };
  }
  messages = purifyHistory(messages, targetTokens);
  currentTokens = estimateTokens(messages);
  stats.layers.push({ name: "purify_history", tokens: currentTokens });
  return {
    body: { ...body, messages },
    compressed: true,
    stats: { ...stats, final: currentTokens }
  };
}
function trimToolMessages(messages, maxChars) {
  return messages.map((msg) => {
    if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > maxChars) {
      return {
        ...msg,
        content: msg.content.slice(0, maxChars) + "\n... [truncated]"
      };
    }
    if (msg.role === "user" && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (block.type === "tool_result" && typeof block.content === "string" && block.content.length > maxChars) {
            return { ...block, content: block.content.slice(0, maxChars) + "\n... [truncated]" };
          }
          return block;
        })
      };
    }
    return msg;
  });
}
function compressThinking(messages) {
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  return messages.map((msg, i) => {
    if (msg.role !== "assistant") return msg;
    if (i === lastAssistantIdx) return msg;
    if (Array.isArray(msg.content)) {
      const filtered = msg.content.filter((block) => block.type !== "thinking");
      if (filtered.length === 0) {
        return { ...msg, content: "[thinking compressed]" };
      }
      return { ...msg, content: filtered };
    }
    return msg;
  });
}
function purifyHistory(messages, targetTokens) {
  const system = messages.filter((m) => m.role === "system" || m.role === "developer");
  const nonSystem = messages.filter((m) => m.role !== "system" && m.role !== "developer");
  let keep = nonSystem.length;
  while (keep > 2) {
    let candidate = [...system, ...nonSystem.slice(-keep)];
    candidate = fixToolPairs(candidate);
    candidate = fixToolAdjacency(candidate);
    candidate = fixToolPairs(candidate);
    candidate = stripTrailingAssistantOrphanToolUse(candidate);
    const tokens = estimateTokens(candidate);
    if (tokens <= targetTokens) break;
    keep = Math.max(2, Math.floor(keep * 0.7));
  }
  let result = [...system, ...nonSystem.slice(-keep)];
  result = fixToolPairs(result);
  result = fixToolAdjacency(result);
  result = fixToolPairs(result);
  result = stripTrailingAssistantOrphanToolUse(result);
  if (keep < nonSystem.length) {
    const dropped = nonSystem.length - keep;
    const droppedNotice = `[Context compressed: ${dropped} earlier messages removed to fit context window]`;
    const first = result[0];
    if (first && (first.role === "system" || first.role === "developer")) {
      if (typeof first.content === "string") {
        result[0] = {
          ...first,
          content: first.content ? `${droppedNotice}
${first.content}` : droppedNotice
        };
      } else if (Array.isArray(first.content)) {
        result[0] = {
          ...first,
          content: [{ type: "text", text: droppedNotice }, ...first.content]
        };
      } else {
        result[0] = { ...first, content: droppedNotice };
      }
    } else {
      result.unshift({ role: "system", content: droppedNotice });
    }
  }
  return result;
}
function fixToolPairs(messages) {
  const toolResultIds = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      toolResultIds.add(msg.tool_call_id);
    }
    if (msg.role === "user" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }
  const isLastMessage = (idx) => idx === messages.length - 1;
  const filteredMessages = messages.map((msg, idx) => {
    if (msg.role === "assistant" && !isLastMessage(idx)) {
      let modified = false;
      const newMsg = { ...msg };
      if (Array.isArray(newMsg.tool_calls)) {
        const filteredToolCalls = newMsg.tool_calls.filter(
          (tc) => !tc.id || toolResultIds.has(tc.id)
        );
        if (filteredToolCalls.length !== newMsg.tool_calls.length) {
          newMsg.tool_calls = filteredToolCalls;
          modified = true;
        }
      }
      if (Array.isArray(newMsg.content)) {
        const filteredContent = newMsg.content.filter(
          (block) => block.type !== "tool_use" || !block.id || toolResultIds.has(block.id)
        );
        if (filteredContent.length !== newMsg.content.length) {
          newMsg.content = filteredContent;
          modified = true;
        }
      }
      return modified ? newMsg : msg;
    }
    return msg;
  });
  const toolCallIds = /* @__PURE__ */ new Set();
  for (const msg of filteredMessages) {
    if (msg.role === "assistant") {
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.id) toolCallIds.add(tc.id);
        }
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use" && block.id) {
            toolCallIds.add(block.id);
          }
        }
      }
    }
  }
  return filteredMessages.map((msg) => {
    if (msg.role === "tool" && msg.tool_call_id) {
      if (!toolCallIds.has(msg.tool_call_id)) return null;
    }
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const filteredContent = msg.content.filter(
        (block) => block.type !== "tool_result" || !block.tool_use_id || toolCallIds.has(block.tool_use_id)
      );
      if (filteredContent.length !== msg.content.length) {
        if (filteredContent.length === 0) return null;
        return { ...msg, content: filteredContent };
      }
    }
    if (msg.role === "assistant") {
      const hasContent = typeof msg.content === "string" ? msg.content.trim().length > 0 : Array.isArray(msg.content) && msg.content.length > 0;
      const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
      if (!hasContent && !hasToolCalls) {
        return null;
      }
    }
    return msg;
  }).filter(Boolean);
}
function fixToolAdjacency(messages) {
  if (messages.length <= 1) return messages;
  const result = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];
    if (msg.role !== "assistant" || !nextMsg) {
      result.push(msg);
      continue;
    }
    const nextToolResultIds = /* @__PURE__ */ new Set();
    if (nextMsg.role === "tool" && nextMsg.tool_call_id) {
      nextToolResultIds.add(String(nextMsg.tool_call_id));
    }
    if (nextMsg.role === "user" && Array.isArray(nextMsg.content)) {
      for (const block of nextMsg.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          nextToolResultIds.add(String(block.tool_use_id));
        }
      }
    }
    let modified = false;
    const newMsg = { ...msg };
    if (Array.isArray(newMsg.content)) {
      const filteredContent = newMsg.content.filter(
        (block) => block.type !== "tool_use" || !block.id || nextToolResultIds.has(String(block.id))
      );
      if (filteredContent.length !== newMsg.content.length) {
        newMsg.content = filteredContent;
        modified = true;
      }
    }
    if (Array.isArray(newMsg.tool_calls)) {
      const filteredToolCalls = newMsg.tool_calls.filter(
        (tc) => !tc.id || nextToolResultIds.has(String(tc.id))
      );
      if (filteredToolCalls.length !== newMsg.tool_calls.length) {
        newMsg.tool_calls = filteredToolCalls;
        modified = true;
      }
    }
    if (modified) {
      const hasContent = typeof newMsg.content === "string" ? newMsg.content.trim().length > 0 : Array.isArray(newMsg.content) && newMsg.content.length > 0;
      const hasToolCalls = Array.isArray(newMsg.tool_calls) && newMsg.tool_calls.length > 0;
      if (!hasContent && !hasToolCalls) continue;
      result.push(newMsg);
    } else {
      result.push(msg);
    }
  }
  return result;
}
function stripTrailingAssistantOrphanToolUse(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (!last || last.role !== "assistant") return messages;
  let modified = false;
  const newLast = { ...last };
  if (Array.isArray(newLast.tool_calls)) {
    const filteredCalls = newLast.tool_calls.filter(
      () => false
      // remove all trailing tool_calls (none can be paired by definition)
    );
    if (filteredCalls.length !== newLast.tool_calls.length) {
      newLast.tool_calls = filteredCalls;
      modified = true;
    }
  }
  if (Array.isArray(newLast.content)) {
    const filteredContent = newLast.content.filter(
      (block) => block.type !== "tool_use"
    );
    if (filteredContent.length !== newLast.content.length) {
      newLast.content = filteredContent;
      modified = true;
    }
  }
  if (!modified) return messages;
  const hasContent = typeof newLast.content === "string" ? newLast.content.trim().length > 0 : Array.isArray(newLast.content) && newLast.content.length > 0;
  const hasToolCalls = Array.isArray(newLast.tool_calls) && newLast.tool_calls.length > 0;
  const result = messages.slice(0, lastIdx);
  if (hasContent || hasToolCalls) result.push(newLast);
  return result;
}
const PROVIDERS_REQUIRING_USER_LAST_MESSAGE = /* @__PURE__ */ new Set(["mistral"]);
function stripTrailingAssistantForProvider(messages, provider) {
  if (!PROVIDERS_REQUIRING_USER_LAST_MESSAGE.has(provider)) return messages;
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return messages;
  const hasToolUse = Array.isArray(last.content) && last.content.some((b) => b.type === "tool_use");
  const hasToolCalls = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
  if (hasToolUse || hasToolCalls) return messages;
  return messages.slice(0, messages.length - 1);
}
export {
  compressContext,
  estimateTokens,
  fixToolAdjacency,
  fixToolPairs,
  getComboTargetTokenLimit,
  getSourcedTokenLimit,
  getTokenLimit,
  isInlineBase64DocumentBlock,
  isInlineBase64ImageBlock,
  pruneOlderInlineImages,
  resolveComboContextLimit,
  resolveTokenLimit,
  stripTrailingAssistantForProvider,
  stripTrailingAssistantOrphanToolUse
};
