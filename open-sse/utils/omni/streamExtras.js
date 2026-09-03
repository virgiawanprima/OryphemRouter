/**
 * ADAPTED — OmniRoute's utils/stream.ts exports withBodyTimeout(); OryphemRouter's
 * ported utils/stream.js does not provide it (and itself imports deep @/ infra).
 * Faithful port: races the promise against a BodyTimeoutError timer.
 */
const FETCH_BODY_TIMEOUT_MS = 30000;
export function withBodyTimeout(promise, timeoutMs = FETCH_BODY_TIMEOUT_MS) {
  if (timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Response body read timeout after ${timeoutMs}ms`);
      err.name = "BodyTimeoutError";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
export default { withBodyTimeout };
