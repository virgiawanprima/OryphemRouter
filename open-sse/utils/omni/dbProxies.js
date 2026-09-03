/**
 * ADAPTED STUB — replaces OmniRoute "src/lib/db/proxies" for the TheOldLlm
 * executor. OryphemRouter has no proxy-assignment DB, so provider proxies
 * always resolve to null (direct egress) and blocking assignments are off.
 */
export async function resolveProxyForProvider(_provider) {
  return null;
}

export function hasBlockingProxyAssignmentForProvider(_provider) {
  return false;
}
