// ADAPTED STUB — ported from OmniRoute src/lib/usage/usageHistory.ts
// Only `finalizeMostRecentPendingRequest` / `finalizePendingRequestById` are needed
// (by streamFailureFinalization.js). No-op: OryphemRouter has no pending-request ledger.
export function finalizeMostRecentPendingRequest(_model, _provider, _connectionId, _metadata) {
  // no-op
}

export function finalizePendingRequestById(_id, _metadata) {
  return false;
}

export function finalizePendingRequest(_model, _provider, _connectionId, _metadata) {
  // no-op
}

export function updatePendingRequest(_model, _provider, _connectionId, _metadata) {
  // no-op
}

export function updatePendingRequestById(_id, _metadata) {
  return false;
}
