import { createHash } from "node:crypto";
import {
  clearAllReasoningCache,
  cleanupExpiredReasoning,
  deleteReasoningCache,
  getReasoningCache,
  getReasoningCacheEntries,
  getReasoningCacheStats,
  setReasoningCache
} from "../utils/omni/reasoningCacheDb.js";
import { log } from "../utils/log.js";
import { isInternalReasoningPlaceholder } from "../utils/omni/reasoningPlaceholder.js";
const REASONING_REPLAY_PROVIDERS = /* @__PURE__ */ new Set([
  "deepseek",
  "opencode-go",
  "siliconflow",
  "nebius",
  "deepinfra",
  "sambanova",
  "fireworks",
  "together",
  // Kimi Coding thinking-mode upstreams require reasoning_content replay under
  // the same strict multi-turn contract as DeepSeek.
  "kimi-coding",
  "kimi-coding-apikey",
  // Xiaomi MiMo enforces the same "pass back reasoning_content on subsequent
  // turns" contract as DeepSeek/Kimi-thinking. Without replay the upstream
  // 400s with "Param Incorrect: The reasoning_content in the thinking mode
  // must be passed back to the API."
  "xiaomi-mimo"
]);
const REASONING_REPLAY_MODEL_PATTERNS = [
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /deepseek-chat/i,
  /deepseek[-/]v4[-.](flash|pro)(-free)?/i,
  /zen\/deepseek-v4/i,
  // Match native kimi-kN and namespaced kimi/kN families without treating
  // generic aliases such as kimi-latest as strict thinking models.
  /kimi[-/]k\d/i,
  /qwq/i,
  /qwen.*think/i,
  /glm.*think/i,
  // MiMo (Xiaomi) thinking models — defensive match if a wildcard route
  // assigns a non-`xiaomi-mimo` provider ID to a mimo-* model alias.
  /^mimo[-.]?v\d/i
];
const DEEPSEEK_V4_MODEL_PATTERN = /deepseek[-/]v4[-.](flash|pro)/i;
const K3_REASONING_REPLAY_MODEL_PATTERN = /(?:^|\/)(?:kimi-)?k3(?:$|-)/i;
const NATIVE_K27_REASONING_REPLAY_MODEL_PATTERN = /(?:^|\/)kimi-k2\.7-code(?:$|-)/i;
function isDeepSeekReasoningModel(params) {
  if (params.thinkingEnabled !== true) return false;
  return DEEPSEEK_V4_MODEL_PATTERN.test(params.model);
}
function requiresReasoningReplay(params) {
  const normalizedProvider = params.provider.trim().toLowerCase();
  const normalizedModel = params.model.trim();
  const normalizedInterleavedField = typeof params.interleavedField === "string" ? params.interleavedField.trim().toLowerCase() : "";
  if (normalizedInterleavedField === "reasoning_content") return true;
  if (normalizedInterleavedField === "reasoning_details") return false;
  if (K3_REASONING_REPLAY_MODEL_PATTERN.test(normalizedModel)) return true;
  if ((normalizedProvider === "moonshot" || normalizedProvider === "kimi") && NATIVE_K27_REASONING_REPLAY_MODEL_PATTERN.test(normalizedModel)) {
    return true;
  }
  if (/deepseek-reasoner/i.test(normalizedModel) || /deepseek-r1/i.test(normalizedModel)) {
    return false;
  }
  if (isDeepSeekReasoningModel(params)) return true;
  const useLegacyFallback = params.allowLegacyFallback !== false;
  if (!useLegacyFallback) return false;
  if (REASONING_REPLAY_PROVIDERS.has(normalizedProvider)) return true;
  return REASONING_REPLAY_MODEL_PATTERNS.some((p) => p.test(normalizedModel));
}
const memoryCache = /* @__PURE__ */ new Map();
const MAX_MEMORY_ENTRIES = 200;
const MAX_ENTRY_BYTES = 1e4;
const TTL_MS = 2 * 60 * 60 * 1e3;
let hits = 0;
let misses = 0;
let replays = 0;
function evictOldest() {
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [key, entry] of memoryCache) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt;
      oldestKey = key;
    }
  }
  if (oldestKey) memoryCache.delete(oldestKey);
}
function purgeExpiredMemory() {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (now >= entry.expiresAt) {
      memoryCache.delete(key);
    }
  }
}
function cacheReasoning(toolCallId, provider, model, reasoning) {
  cacheReasoningByKey(toolCallId, provider, model, reasoning);
}
function cacheReasoningByKey(key, provider, model, reasoning) {
  if (!key || !reasoning) return;
  if (isInternalReasoningPlaceholder(reasoning)) return;
  if (reasoning.length > MAX_ENTRY_BYTES) {
    reasoning = reasoning.slice(0, MAX_ENTRY_BYTES);
  }
  const now = Date.now();
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    evictOldest();
  }
  memoryCache.set(key, {
    reasoning,
    provider,
    model,
    expiresAt: now + TTL_MS,
    createdAt: now
  });
  try {
    setReasoningCache(key, provider, model, reasoning, TTL_MS);
  } catch {
  }
}
function stableCacheValue(value) {
  if (Array.isArray(value)) return value.map(stableCacheValue);
  if (!value || typeof value !== "object") return value;
  const record = value;
  return Object.fromEntries(
    Object.keys(record).filter((key) => key !== "reasoning" && key !== "reasoning_content").sort().map((key) => [key, stableCacheValue(record[key])])
  );
}
function canonicalizeMessageContent(content) {
  if (!Array.isArray(content)) return stableCacheValue(content ?? null);
  const textParts = [];
  for (const part of content) {
    if (typeof part === "string") {
      textParts.push(part);
      continue;
    }
    if (!part || typeof part !== "object") return stableCacheValue(content);
    const record = part;
    if ((record.type === "text" || record.type === "input_text" || record.type === "output_text") && typeof record.text === "string") {
      textParts.push(record.text);
      continue;
    }
    return stableCacheValue(content);
  }
  return textParts.join("");
}
function canonicalizeHistoryMessage(message) {
  const record = message;
  const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls.map((toolCall) => {
    const call = toolCall;
    const fn = call.function ?? {};
    return stableCacheValue({
      type: call.type,
      function: { name: fn.name, arguments: fn.arguments }
    });
  }) : void 0;
  return stableCacheValue({
    role: record.role,
    name: record.name,
    content: canonicalizeMessageContent(record.content),
    tool_calls: toolCalls
  });
}
function buildAssistantMessageCacheKey(scope, messages, messageIndex) {
  const normalizedScope = scope?.trim();
  if (!normalizedScope || !Number.isInteger(messageIndex) || messageIndex < 0) return "";
  const message = messages[messageIndex];
  if (!message || message.role !== "assistant") return "";
  const transcript = messages.slice(0, messageIndex + 1).map(canonicalizeHistoryMessage);
  const digest = createHash("sha256").update(normalizedScope).update("").update(JSON.stringify(transcript)).digest("hex");
  return `conversation:${digest}`;
}
function cacheReasoningBatch(toolCallIds, provider, model, reasoning) {
  for (const id of toolCallIds) {
    if (id) cacheReasoning(id, provider, model, reasoning);
  }
}
function cacheReasoningFromAssistantMessage(message, provider, model, context) {
  if (!message || message.role !== "assistant") {
    return 0;
  }
  const reasoning = typeof message.reasoning_content === "string" && message.reasoning_content.length > 0 ? message.reasoning_content : typeof message.reasoning === "string" && message.reasoning.length > 0 ? message.reasoning : "";
  if (!reasoning) return 0;
  if (isInternalReasoningPlaceholder(reasoning)) return 0;
  const toolCallIds = Array.isArray(message.tool_calls) ? message.tool_calls.map((toolCall) => typeof toolCall.id === "string" ? toolCall.id : "").filter((id) => id.length > 0) : [];
  if (toolCallIds.length === 0) {
    const scope = context?.scope?.trim();
    const historyMessages = context?.historyMessages;
    if (!scope || !Array.isArray(historyMessages)) return 0;
    const messages = [...historyMessages, message];
    const cacheKey = buildAssistantMessageCacheKey(scope, messages, messages.length - 1);
    if (!cacheKey) return 0;
    cacheReasoningByKey(cacheKey, provider, model, reasoning);
    return 1;
  }
  cacheReasoningBatch(toolCallIds, provider, model, reasoning);
  return toolCallIds.length;
}
function lookupReasoning(toolCallId) {
  if (!toolCallId) {
    misses++;
    return null;
  }
  const mem = memoryCache.get(toolCallId);
  if (mem) {
    if (Date.now() < mem.expiresAt) {
      if (isInternalReasoningPlaceholder(mem.reasoning)) {
        memoryCache.delete(toolCallId);
        misses++;
        return null;
      }
      hits++;
      return mem.reasoning;
    }
    memoryCache.delete(toolCallId);
  }
  let dbResult = null;
  try {
    dbResult = getReasoningCache(toolCallId);
  } catch {
  }
  if (dbResult) {
    if (isInternalReasoningPlaceholder(dbResult.reasoning)) {
      misses++;
      return null;
    }
    const persistedExpiresAt = Date.parse(dbResult.expiresAt);
    if (!Number.isFinite(persistedExpiresAt) || persistedExpiresAt <= Date.now()) {
      misses++;
      return null;
    }
    hits++;
    let promotedReasoning = dbResult.reasoning;
    if (promotedReasoning.length > MAX_ENTRY_BYTES) {
      promotedReasoning = promotedReasoning.slice(0, MAX_ENTRY_BYTES);
    }
    memoryCache.set(toolCallId, {
      reasoning: promotedReasoning,
      provider: dbResult.provider,
      model: dbResult.model,
      expiresAt: persistedExpiresAt,
      createdAt: Date.now()
    });
    return promotedReasoning;
  }
  misses++;
  return null;
}
function recordReplay() {
  replays++;
}
function getReasoningCacheServiceStats() {
  purgeExpiredMemory();
  let dbStats = {
    totalEntries: 0,
    totalChars: 0,
    byProvider: {},
    byModel: {},
    oldestEntry: null,
    newestEntry: null
  };
  try {
    dbStats = getReasoningCacheStats();
  } catch {
  }
  const totalLookups = hits + misses;
  const replayRate = totalLookups > 0 ? (replays / totalLookups * 100).toFixed(1) : "0.0";
  return {
    memoryEntries: memoryCache.size,
    dbEntries: dbStats.totalEntries,
    totalEntries: dbStats.totalEntries,
    totalChars: dbStats.totalChars,
    hits,
    misses,
    replays,
    replayRate: `${replayRate}%`,
    byProvider: dbStats.byProvider,
    byModel: dbStats.byModel,
    oldestEntry: dbStats.oldestEntry,
    newestEntry: dbStats.newestEntry
  };
}
function getReasoningCacheServiceEntries(opts = {}) {
  try {
    return getReasoningCacheEntries(opts);
  } catch {
    return [];
  }
}
function clearReasoningCacheAll(provider) {
  if (provider) {
    for (const [key, entry] of memoryCache) {
      if (entry.provider === provider) memoryCache.delete(key);
    }
  } else {
    memoryCache.clear();
  }
  hits = 0;
  misses = 0;
  replays = 0;
  try {
    return clearAllReasoningCache(provider);
  } catch {
    return 0;
  }
}
function deleteReasoningCacheEntry(toolCallId) {
  if (!toolCallId) return 0;
  const existedInMemory = memoryCache.delete(toolCallId);
  let deletedFromDb = 0;
  try {
    deletedFromDb = deleteReasoningCache(toolCallId);
  } catch {
  }
  return deletedFromDb + (existedInMemory && deletedFromDb === 0 ? 1 : 0);
}
function cleanupReasoningCache() {
  purgeExpiredMemory();
  try {
    return cleanupExpiredReasoning();
  } catch {
    return 0;
  }
}
const DEFAULT_CLEANUP_INTERVAL_MS = 30 * 60 * 1e3;
function getCleanupIntervalMs() {
  const raw = process.env.OMNIROUTE_REASONING_CACHE_CLEANUP_INTERVAL_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 6e4 ? parsed : DEFAULT_CLEANUP_INTERVAL_MS;
}
function startAutoCleanup() {
  try {
    const deleted = cleanupReasoningCache();
    if (deleted > 0) {
      log.info("REASONING-CACHE", `[ReasoningCache] boot cleanup removed ${deleted} expired entries`);
    }
  } catch (error) {
    log.error("REASONING-CACHE", "[ReasoningCache] boot cleanup failed:", error);
  }
  const timer = setInterval(() => {
    try {
      const deleted = cleanupReasoningCache();
      if (deleted > 0) {
        log.info("REASONING-CACHE", `[ReasoningCache] periodic cleanup removed ${deleted} expired entries`);
      }
    } catch (error) {
      log.error("REASONING-CACHE", "[ReasoningCache] periodic cleanup failed:", error);
    }
  }, getCleanupIntervalMs());
  timer.unref?.();
}
startAutoCleanup();
export {
  buildAssistantMessageCacheKey,
  cacheReasoning,
  cacheReasoningBatch,
  cacheReasoningByKey,
  cacheReasoningFromAssistantMessage,
  cleanupReasoningCache,
  clearReasoningCacheAll,
  deleteReasoningCacheEntry,
  getReasoningCacheServiceEntries,
  getReasoningCacheServiceStats,
  isDeepSeekReasoningModel,
  lookupReasoning,
  recordReplay,
  requiresReasoningReplay
};
