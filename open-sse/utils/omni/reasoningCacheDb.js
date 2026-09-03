// ADAPTED STUB — reasoning cache DB surface for OryphemRouter.
// OmniRoute `src/lib/db/reasoningCache.ts` persists reasoning_content between
// turns (DeepSeek K2 replay requirement). OryphemRouter keeps the cache
// in-memory inside services/reasoningCache.js; these DB-backed functions are
// graceful no-ops so the service remains fully functional in-memory.
const memCache = new Map();

export function setReasoningCache(key, _provider, _model, reasoning, _ttlMs) {
  memCache.set(key, { reasoning, at: Date.now() });
  return true;
}

export function getReasoningCache(key) {
  const entry = memCache.get(key);
  return entry ? entry.reasoning : null;
}

export function deleteReasoningCache(key) {
  memCache.delete(key);
  return true;
}

export function clearAllReasoningCache() {
  memCache.clear();
  return true;
}

export function cleanupExpiredReasoning(_nowMs) {
  return 0;
}

export function getReasoningCacheEntries() {
  return [];
}

export function getReasoningCacheStats() {
  return { entries: memCache.size, hits: 0, misses: 0 };
}
