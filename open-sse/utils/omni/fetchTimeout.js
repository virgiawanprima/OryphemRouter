const DEFAULT_TIMEOUT_MS = parseInt(process.env.OMNIROUTE_DEFAULT_FETCH_TIMEOUT_MS || "", 10) || 12e4;
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS;
async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = FETCH_TIMEOUT_MS, signal: externalSignal, fetchFn, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  try {
    const doFetch = fetchFn || globalThis.fetch;
    const response = await doFetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new FetchTimeoutError(
        `Request to ${url} timed out after ${timeoutMs}ms`,
        timeoutMs,
        String(url)
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
class FetchTimeoutError extends Error {
  timeoutMs;
  url;
  constructor(message, timeoutMs, url) {
    super(message);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}
function getConfiguredTimeout() {
  return FETCH_TIMEOUT_MS;
}
export {
  FetchTimeoutError,
  fetchWithTimeout,
  getConfiguredTimeout
};
