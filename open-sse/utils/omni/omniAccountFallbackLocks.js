// Minimal adaptation of OmniRoute accountFallback lockModel/isModelLocked
// (in-memory model lockouts). OryphemRouter's services/accountFallback.js uses a
// different connection-flat-field scheme, so the alibaba free-tier code paths use
// this in-memory Map instead. 24h default cooldown matches ALIBABA_FREE_DRAINED_LOCK_MS.
const locks = new Map();
function getKey(provider, connectionId, model) {
  return [provider, connectionId || "", model || ""].join("|");
}
export function lockModel(provider, connectionId, model, reason, cooldownMs, metadata = {}) {
  if (!model) return;
  const key = getKey(provider, connectionId, model);
  const until = Date.now() + cooldownMs;
  const existing = locks.get(key);
  if (existing && existing.until > until) return;
  locks.set(key, { reason, until, lockedAt: Date.now(), failureCount: metadata.failureCount ?? existing?.failureCount ?? 1 });
}
export function isModelLocked(provider, connectionId, model) {
  if (!model) return false;
  const key = getKey(provider, connectionId, model);
  const entry = locks.get(key);
  if (!entry) return false;
  if (entry.until <= Date.now()) { locks.delete(key); return false; }
  return true;
}
export function clearModelLocksForTest() { locks.clear(); }
