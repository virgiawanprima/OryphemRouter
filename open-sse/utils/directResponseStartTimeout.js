const DEFAULT_DIRECT_HEADERS_TIMEOUT_MS = 3e4;
const DIRECT_RESPONSE_START_TIMEOUT_CODE = "DIRECT_RESPONSE_START_TIMEOUT";
function resolveDirectHeadersTimeoutMs(env = process.env) {
  const raw = env.OMNIROUTE_DIRECT_HEADERS_TIMEOUT_MS;
  if (raw == null || raw.trim() === "") return DEFAULT_DIRECT_HEADERS_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
function createDirectResponseStartTimeout(timeoutMs) {
  const err = new Error(
    `Direct response did not start within ${timeoutMs}ms \u2014 retrying on a fresh socket`
  );
  err.name = "TimeoutError";
  err.code = DIRECT_RESPONSE_START_TIMEOUT_CODE;
  return err;
}
function isDirectResponseStartTimeout(err) {
  return !!err && typeof err === "object" && "code" in err && err.code === DIRECT_RESPONSE_START_TIMEOUT_CODE;
}
function mergeAbortSignals(primary, secondary) {
  if (!primary) return secondary;
  if (primary.aborted) return primary;
  const controller = new AbortController();
  const onPrimaryAbort = () => controller.abort(primary.reason);
  const onSecondaryAbort = () => controller.abort(secondary.reason);
  const cleanup = () => {
    primary.removeEventListener("abort", onPrimaryAbort);
    secondary.removeEventListener("abort", onSecondaryAbort);
  };
  primary.addEventListener("abort", onPrimaryAbort, { once: true });
  secondary.addEventListener("abort", onSecondaryAbort, { once: true });
  controller.signal.addEventListener("abort", cleanup, { once: true });
  return controller.signal;
}
async function directFetchWithBoundedResponseStart(input, options, fetchImpl, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return fetchImpl(input, options);
  const attemptController = new AbortController();
  const timer = setTimeout(
    () => attemptController.abort(createDirectResponseStartTimeout(timeoutMs)),
    timeoutMs
  );
  timer.unref?.();
  try {
    return await fetchImpl(input, {
      ...options,
      signal: mergeAbortSignals(options.signal, attemptController.signal)
    });
  } finally {
    clearTimeout(timer);
  }
}
export {
  directFetchWithBoundedResponseStart,
  isDirectResponseStartTimeout,
  resolveDirectHeadersTimeoutMs
};
