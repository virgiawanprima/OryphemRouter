// ADAPTED STUB — OmniRoute `src/lib/credentialHealth/cache.ts` maintains an
// in-memory cache of per-connection credential health, populated by a
// background scheduler. OryphemRouter does not run that scheduler; we assume
// credentials are healthy and provide an empty summary.
export function isCredentialHealthy(_connectionId) {
  return true;
}

export function isCredentialStale(_connectionId) {
  return false;
}

export function getCredentialHealthSummary() {
  return { healthy: 0, stale: 0, unknown: 0, total: 0 };
}
