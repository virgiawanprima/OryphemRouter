// ADAPTED — graceful fallback (was @/lib/idempotencyLayer).
// No-op in-memory idempotency store: cache lookups always miss, keys derive from headers.
import { createHash } from "node:crypto";

export function getIdempotencyKey(headers) {
  if (!headers || typeof headers !== "object") return null;
  const get = (name) => {
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name];
  };
  const raw = get("Idempotency-Key") || get("idempotency-key") || get("x-request-id") || null;
  return raw && typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

const _store = new Map();
const DEFAULT_WINDOW_MS = 5_000;

export function checkIdempotency(key) {
  if (!key) return null;
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DEFAULT_WINDOW_MS) {
    _store.delete(key);
    return null;
  }
  return { response: entry.response, status: entry.status };
}

export function saveIdempotency(key, response, status, windowMs = DEFAULT_WINDOW_MS) {
  if (!key) return;
  _store.set(key, { response, status, ts: Date.now() });
}

export function clearIdempotency() {
  _store.clear();
}

export function composeIdempotencyDigest(messages) {
  try {
    return createHash("sha256").update(JSON.stringify(messages ?? "")).digest("hex").slice(0, 16);
  } catch {
    return "nodigest";
  }
}