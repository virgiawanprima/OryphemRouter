// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/db/contextHandoffs.ts` persists handoff payloads (long-running
// context handoff between requests) in SQLite. Deep app infra — this is an in-memory
// fallback so `contextHandoff` loads and works within a single process lifetime.

const _handoffs = new Map(); // key -> { payload, expiresAt }

function normalizeKey(key) {
  if (key && typeof key === "object") {
    return JSON.stringify(key);
  }
  return String(key ?? "");
}

/** Store a handoff payload with an optional TTL (ms). */
export function upsertHandoff(key, payload, opts = {}) {
  const k = normalizeKey(key);
  const expiresAt = opts?.ttlMs ? Date.now() + opts.ttlMs : opts?.expiresAt ?? null;
  _handoffs.set(k, { payload, expiresAt, createdAt: Date.now() });
  return true;
}

/** Retrieve a handoff payload (if not expired). */
export function getHandoff(key) {
  const k = normalizeKey(key);
  const entry = _handoffs.get(k);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    _handoffs.delete(k);
    return null;
  }
  return entry.payload;
}

/** Whether a non-expired handoff exists for the key. */
export function hasActiveHandoff(key) {
  return getHandoff(key) !== null;
}

/** Remove all expired handoffs. */
export function cleanupExpiredHandoffs() {
  const now = Date.now();
  for (const [k, entry] of _handoffs) {
    if (entry.expiresAt !== null && now > entry.expiresAt) _handoffs.delete(k);
  }
  return _handoffs.size;
}
