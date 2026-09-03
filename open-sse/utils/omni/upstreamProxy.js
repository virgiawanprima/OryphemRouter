// ADAPTED — graceful fallback (was @/lib/db/upstreamProxy).
// FallbackBackend type only; runtime helpers return graceful defaults.
export function validateProxyUrl() {
  return { ok: false, error: "not implemented" };
}
export const DEFAULT_FALLBACK_BACKEND = "cliproxyapi";