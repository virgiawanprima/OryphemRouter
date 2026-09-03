// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/db/ccrBlocks.ts` is a SQLite-backed content-addressed store used by
// the CCR compression engine. Deep app infra — this is an in-memory fallback so
// `compression/engines/ccr` loads and works within a single process lifetime.

const _blocks = new Map(); // `${principalId}\u0000${hash}` -> row
let _pruneCounter = 0;

function key(principalId, hash) {
  return `${principalId ?? "__anon__"}\u0000${hash}`;
}

export function persistCcrBlock(row) {
  _blocks.set(key(row.principalId, row.hash), { ...row });
  _pruneCounter += 1;
  if (_pruneCounter >= 100) {
    _pruneCounter = 0;
    pruneExpiredCcrBlocks(Date.now());
  }
}

export function loadCcrBlock(principalId, hash, now) {
  const row = _blocks.get(key(principalId, hash));
  if (!row) return null;
  if (row.expiresAt != null && row.expiresAt <= now) {
    deleteCcrBlockRow(principalId, hash);
    return null;
  }
  return { ...row };
}

export function touchCcrBlock(principalId, hash, lastAccessedAt) {
  const row = _blocks.get(key(principalId, hash));
  if (row) row.lastAccessedAt = lastAccessedAt;
}

export function deleteCcrBlockRow(principalId, hash) {
  _blocks.delete(key(principalId, hash));
}

export function deleteAllCcrBlocks() {
  _blocks.clear();
}

export function pruneExpiredCcrBlocks(now) {
  let removed = 0;
  for (const [k, row] of _blocks) {
    if (row.expiresAt != null && row.expiresAt <= now) {
      _blocks.delete(k);
      removed += 1;
    }
  }
  return removed;
}

export function countCcrBlocks(principalId) {
  if (!principalId) return _blocks.size;
  let n = 0;
  for (const [k] of _blocks) {
    if (k.startsWith(`${principalId}\u0000`)) n += 1;
  }
  return n;
}

export function resetCcrBlockPruneCounter() {
  _pruneCounter = 0;
}
