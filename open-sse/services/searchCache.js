import { createHash } from "crypto";
const MAX_CACHE_ENTRIES = 500;
const DEFAULT_TTL_MS = parseInt(process.env.SEARCH_CACHE_TTL_MS || String(60 * 1e3), 10);
const cache = /* @__PURE__ */ new Map();
const inflight = /* @__PURE__ */ new Map();
let hits = 0;
let misses = 0;
function normalizeQuery(query) {
  return query.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}
function computeCacheKey(query, provider, searchType, maxResults, country, language, filters) {
  const normalized = normalizeQuery(query);
  const payload = JSON.stringify({
    q: normalized,
    p: provider,
    t: searchType,
    n: maxResults,
    c: country || null,
    l: language || null,
    f: filters || null
  });
  return createHash("sha256").update(payload).digest("hex");
}
function evictIfNeeded() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== void 0) {
      cache.delete(firstKey);
    } else {
      break;
    }
  }
}
async function getOrCoalesce(key, ttlMs, fetchFn) {
  if (ttlMs <= 0) {
    misses++;
    const data = await fetchFn();
    return { data, cached: false };
  }
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    hits++;
    return { data: cached.data, cached: true };
  }
  const existing = inflight.get(key);
  if (existing) {
    hits++;
    const data = await existing;
    return { data, cached: true };
  }
  misses++;
  const promise = fetchFn();
  inflight.set(key, promise);
  try {
    const data = await promise;
    evictIfNeeded();
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return { data, cached: false };
  } finally {
    inflight.delete(key);
  }
}
function getCacheStats() {
  return { size: cache.size, hits, misses };
}
const SEARCH_CACHE_DEFAULT_TTL_MS = DEFAULT_TTL_MS;
export {
  SEARCH_CACHE_DEFAULT_TTL_MS,
  computeCacheKey,
  getCacheStats,
  getOrCoalesce
};
