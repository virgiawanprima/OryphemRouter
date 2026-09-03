/**
 * Shared sleep utility (ported from OmniRoute open-sse/utils/sleep.ts).
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
