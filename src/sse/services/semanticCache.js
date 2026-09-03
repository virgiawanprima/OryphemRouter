// Semantic Cache — in-memory, temperature=0 only (OmniRoute-style capability).
//
// Ported for OryphemRouter as an opt-in (default OFF) optimization. Caches a
// non-streaming LLM JSON response keyed by a deterministic signature of
// (model + normalized messages + temperature + top_p + api key). Repeated
// requests with temperature 0 return the cached payload immediately and report
// `x-oryphemrouter-cache: HIT`.
//
// Deliberately scoped to NON-streaming, single-model requests so we never have
// to intercept/resume a streaming SSE pipeline. Streaming and combo/fusion/
// pipeline traffic is never cached. A client can opt out per request with
// `x-oryphemrouter-no-cache: true`.

import crypto from "node:crypto";

const LRU_MAX = Number(process.env.SEMANTIC_CACHE_MAX_SIZE || 200);
const TTL_MS = Number(process.env.SEMANTIC_CACHE_TTL_MS || 30 * 60 * 1000); // 30 min

// Simple in-memory LRU with TTL. No SQLite persistence: the engine's DB layer
// is the app's own (better-sqlite3/sql.js) and cross-cutting persistence would
// pull schema migrations into scope; an in-memory cache still captures the bulk
// of repeated-tool-call savings within a process lifetime.
const store = new Map(); // signature -> { expiresAt, model, response, tokensSaved }
const ORDER = new Map(); // signature -> timestamp for LRU eviction order
let stats = { hits: 0, misses: 0, tokensSaved: 0 };

function normalizeConversation(conversation) {
  if (typeof conversation === "string") return [{ role: "user", content: conversation }];
  if (!Array.isArray(conversation)) return [];
  return conversation.map((item) => {
    const rec = item && typeof item === "object" ? item : {};
    return {
      role: typeof rec.role === "string" && rec.role.trim() ? rec.role : "user",
      content: stringifyForSignature(rec.content),
    };
  });
}

function stringifyForSignature(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const needle = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === needle) return typeof v === "string" ? v : null;
  }
  return null;
}

function now() {
  return Date.now();
}

function evictExpired() {
  const t = now();
  for (const [sig, entry] of store) {
    if (entry.expiresAt <= t) {
      store.delete(sig);
      ORDER.delete(sig);
    }
  }
  // Enforce LRU cap.
  while (store.size > LRU_MAX) {
    let oldestSig = null;
    let oldestTs = Infinity;
    for (const [sig, ts] of ORDER) {
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestSig = sig;
      }
    }
    if (!oldestSig) break;
    store.delete(oldestSig);
    ORDER.delete(oldestSig);
  }
}

export function isCacheableForRead(body, headers) {
  if ((headerValue(headers, "x-oryphemrouter-no-cache") || "").toLowerCase() === "true") return false;
  if (!body || typeof body.temperature !== "number" || body.temperature !== 0) return false;
  return true;
}

export function isCacheableForWrite(body, headers) {
  return isCacheableForRead(body, headers);
}

export function generateSignature(model, conversation, temperature = 0, topP = 1, apiKeyId) {
  const payload = JSON.stringify({
    model,
    messages: normalizeConversation(conversation),
    temperature,
    top_p: topP,
  });
  const digest = crypto.createHash("sha256").update(payload).digest("hex");
  return apiKeyId ? `${apiKeyId}.${digest}` : digest;
}

export function getCachedResponse(signature) {
  evictExpired();
  const entry = store.get(signature);
  if (entry) {
    ORDER.set(signature, now());
    stats.hits += 1;
    stats.tokensSaved += entry.tokensSaved || 0;
    return { response: entry.response, tokensSaved: entry.tokensSaved || 0 };
  }
  stats.misses += 1;
  return null;
}

export function setCachedResponse(signature, model, response, tokensSaved = 0) {
  evictExpired();
  const ttl = Number(process.env.SEMANTIC_CACHE_TTL_MS || TTL_MS);
  store.set(signature, { expiresAt: now() + ttl, model, response, tokensSaved: tokensSaved || 0 });
  ORDER.set(signature, now());
}

export function invalidateByModel(model) {
  for (const [sig, entry] of store) {
    if (entry.model === model) {
      store.delete(sig);
      ORDER.delete(sig);
    }
  }
}

export function clearCache() {
  store.clear();
  ORDER.clear();
}

export function getCacheStats() {
  return {
    entries: store.size,
    hits: stats.hits,
    misses: stats.misses,
    tokensSaved: stats.tokensSaved,
    hitRate: stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
      : "0.0",
  };
}
