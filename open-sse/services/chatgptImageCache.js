import { createHash, randomUUID } from "node:crypto";
const cache = /* @__PURE__ */ new Map();
let cacheBytes = 0;
const DEFAULT_TTL_MS = 30 * 60 * 1e3;
const MAX_ENTRIES = 25;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
function configuredMaxBytes() {
  const raw = Number(process.env.OMNIROUTE_CGPT_WEB_IMAGE_CACHE_MAX_MB);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_BYTES;
  return Math.floor(raw * 1024 * 1024);
}
function deleteEntry(id) {
  const entry = cache.get(id);
  if (!entry) return;
  cacheBytes -= entry.bytes.length;
  cache.delete(id);
}
function evictExpired(now = Date.now()) {
  for (const [id, entry] of cache) {
    if (now >= entry.expiresAt) deleteEntry(id);
  }
}
function evictUntilWithinLimits(maxBytes, incomingBytes) {
  while ((cache.size >= MAX_ENTRIES || cacheBytes + incomingBytes > maxBytes) && cache.size > 0) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) break;
    deleteEntry(firstKey);
  }
}
function storeChatGptImage(bytes, mime, ttlMs = DEFAULT_TTL_MS, context) {
  evictExpired();
  evictUntilWithinLimits(configuredMaxBytes(), bytes.length);
  const id = randomUUID().replace(/-/g, "");
  const bytesSha256 = createHash("sha256").update(bytes).digest("hex");
  cache.set(id, {
    bytes,
    mime,
    expiresAt: Date.now() + ttlMs,
    context,
    bytesSha256
  });
  cacheBytes += bytes.length;
  return id;
}
function getChatGptImage(id) {
  evictExpired();
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    deleteEntry(id);
    return null;
  }
  return entry;
}
function getChatGptImageConversationContext(id) {
  return getChatGptImage(id)?.context ?? null;
}
function findChatGptImageBySha256(hash) {
  evictExpired();
  const target = hash.toLowerCase();
  for (const [id, entry] of cache.entries()) {
    if (entry.bytesSha256 === target) {
      if (Date.now() < entry.expiresAt) return { id, entry };
      deleteEntry(id);
    }
  }
  return null;
}
function __resetChatGptImageCacheForTesting() {
  cache.clear();
  cacheBytes = 0;
}
function __getChatGptImageCacheBytesForTesting() {
  return cacheBytes;
}
export {
  __getChatGptImageCacheBytesForTesting,
  __resetChatGptImageCacheForTesting,
  findChatGptImageBySha256,
  getChatGptImage,
  getChatGptImageConversationContext,
  storeChatGptImage
};
