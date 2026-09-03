import {
  EXECUTOR_CONTRACT_VIOLATION_CODE,
  FETCH_TIMEOUT_MS,
  HTTP_STATUS
} from "../../utils/omni/omniConstants.js";
import { getModelTimeoutMs } from "../../utils/omni/providerModels.js";
import {
  getLoggedInputTokens,
  getLoggedOutputTokens,
  getReasoningTokens
} from "../../utils/omni/tokenAccounting.js";
import { MAX_PROVIDER_SPECIFIC_TIMEOUT_MS } from "../../utils/omni/providerSpecificData.js";
function createBodyTimeoutError(timeoutMs) {
  const err = new Error(`Response body read timeout after ${timeoutMs}ms`);
  err.name = "BodyTimeoutError";
  return err;
}
function readStreamChunkWithTimeout(reader, timeoutMs) {
  if (timeoutMs <= 0) return reader.read();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(createBodyTimeoutError(timeoutMs)), timeoutMs);
    reader.read().then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
function createUpstreamStartTimeoutError(timeoutMs, provider, model) {
  const err = new Error(
    `Upstream request did not return response headers after ${timeoutMs}ms (${provider}/${model})`
  );
  err.name = "TimeoutError";
  return err;
}
function createAbortError(signal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  err.name = "AbortError";
  return err;
}
function computeBillableTokens(usage) {
  return getLoggedInputTokens(usage) + getLoggedOutputTokens(usage) + getReasoningTokens(usage);
}
function resolveModelTimeoutOverride(provider, model) {
  if (!provider || !model) return void 0;
  const override = getModelTimeoutMs(provider, model);
  if (typeof override !== "number" || !Number.isFinite(override)) return void 0;
  return Math.max(0, Math.floor(override));
}
function resolveProviderTimeoutMs(executor) {
  const getTimeoutMs = executor?.getTimeoutMs;
  if (typeof getTimeoutMs !== "function") return FETCH_TIMEOUT_MS;
  try {
    const timeoutMs = getTimeoutMs.call(executor);
    if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return FETCH_TIMEOUT_MS;
    return Math.max(0, Math.floor(timeoutMs));
  } catch {
    return FETCH_TIMEOUT_MS;
  }
}
function resolveConnectionTimeoutMs(psd) {
  const timeoutMs = psd?.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return void 0;
  const floored = Math.floor(timeoutMs);
  if (floored < 1 || floored > MAX_PROVIDER_SPECIFIC_TIMEOUT_MS) return void 0;
  return floored;
}
function getExecutorTimeoutMs(executor, provider, model, connectionTimeoutMs) {
  if (typeof connectionTimeoutMs === "number" && Number.isFinite(connectionTimeoutMs) && connectionTimeoutMs > 0) {
    return Math.min(
      Math.max(0, Math.floor(connectionTimeoutMs)),
      MAX_PROVIDER_SPECIFIC_TIMEOUT_MS
    );
  }
  const modelOverride = resolveModelTimeoutOverride(provider, model);
  if (modelOverride !== void 0) return modelOverride;
  return resolveProviderTimeoutMs(executor);
}
function isResponseLike(value) {
  if (value instanceof Response) return true;
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return Object.prototype.toString.call(value) === "[object Response]" && typeof candidate.status === "number" && typeof candidate.ok === "boolean" && !!candidate.headers && typeof candidate.headers.get === "function" && typeof candidate.text === "function" && typeof candidate.clone === "function";
}
function createExecutorContractError() {
  const err = new TypeError("Executor result must contain a Response");
  err.name = "ExecutorContractError";
  err.status = HTTP_STATUS.SERVER_ERROR;
  err.code = EXECUTOR_CONTRACT_VIOLATION_CODE;
  return err;
}
function normalizeExecutorResult(result) {
  if (isResponseLike(result)) {
    return { response: result, url: "", headers: {}, transformedBody: null };
  }
  if (!result || typeof result !== "object" || !("response" in result) || !isResponseLike(result.response)) {
    throw createExecutorContractError();
  }
  const normalized = result;
  return {
    response: normalized.response,
    url: normalized.url || "",
    headers: normalized.headers || {},
    transformedBody: normalized.transformedBody ?? null,
    transport: normalized.transport
  };
}
async function executeWithUpstreamStartTimeout({
  executor,
  provider,
  model,
  connectionTimeoutMs,
  signal,
  log,
  execute
}) {
  const timeoutMs = getExecutorTimeoutMs(executor, provider, model, connectionTimeoutMs);
  if (timeoutMs <= 0) return execute(signal);
  if (signal.aborted) throw createAbortError(signal);
  const timeoutController = new AbortController();
  const combinedController = new AbortController();
  const timeoutError = createUpstreamStartTimeoutError(timeoutMs, provider, model);
  let timeoutId = null;
  let abortListener = null;
  let timeoutAbortListener = null;
  const abortCombined = (source) => {
    if (combinedController.signal.aborted) return;
    const reason = source.reason instanceof Error ? source.reason : createAbortError(source);
    combinedController.abort(reason);
  };
  abortListener = () => abortCombined(signal);
  timeoutAbortListener = () => abortCombined(timeoutController.signal);
  signal.addEventListener("abort", abortListener, { once: true });
  timeoutController.signal.addEventListener("abort", timeoutAbortListener, { once: true });
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      log?.warn?.("TIMEOUT", timeoutError.message);
      timeoutController.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  const abortPromise = new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(createAbortError(signal)), { once: true });
  });
  try {
    return await Promise.race([execute(combinedController.signal), timeoutPromise, abortPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortListener) signal.removeEventListener("abort", abortListener);
    if (timeoutAbortListener) {
      timeoutController.signal.removeEventListener("abort", timeoutAbortListener);
    }
  }
}
export {
  computeBillableTokens,
  createAbortError,
  createBodyTimeoutError,
  createExecutorContractError,
  createUpstreamStartTimeoutError,
  executeWithUpstreamStartTimeout,
  getExecutorTimeoutMs,
  isResponseLike,
  normalizeExecutorResult,
  readStreamChunkWithTimeout,
  resolveConnectionTimeoutMs
};
