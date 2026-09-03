// ADAPTED STUB — ported from OmniRoute src/lib/usage/pendingRequestScope.ts
// Only `updatePendingScope` is needed (by providerRequestLogging.js).
// OryphemRouter has no pending-request usage ledger yet, so this is a no-op that
// still exposes the PendingRequestScope shape for type-compatible callers.
export function updatePendingScope(_scope, _metadata) {
  // no-op: pending-request scope tracking not ported
}
