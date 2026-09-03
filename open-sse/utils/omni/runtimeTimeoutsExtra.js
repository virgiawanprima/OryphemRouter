// ADAPTED STUB — extra runtime-timeout constants/functions used by ported
// services. `utils/omni/runtimeTimeouts.js` (created for proxyDispatcher)
// only exposes `getUpstreamTimeoutConfig`; these additional exports live here
// so the existing stub is untouched.
export const MAX_TIMER_TIMEOUT_MS = 2_147_483_647;

const DEFAULT_STAINLESS_TIMEOUT_SECONDS = 600;

export function getStainlessTimeoutSeconds(
  _pkg,
  _timeoutMs,
  fallbackSeconds = DEFAULT_STAINLESS_TIMEOUT_SECONDS
) {
  return fallbackSeconds;
}
