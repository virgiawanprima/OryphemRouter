/**
 * ADAPTED STUB — OmniRoute's @/shared/utils/circuitBreaker is app infra not
 * present in OryphemRouter. Graceful fallback: breakers always closed/reachable.
 */
const CLOSED = { state: "closed" };
export function getCircuitBreaker() {
  return { getStatus: () => CLOSED, canExecute: () => true };
}
export default { getCircuitBreaker };
