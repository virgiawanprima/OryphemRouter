import { proxyAwareFetch } from "../proxyFetch.js";
import { FetchTimeoutError, fetchWithTimeout } from "./fetchTimeout.js";
import {
  OutboundUrlGuardError,
  parseAndValidateNonMetadataUrl,
  parseAndValidatePublicUrl,
  parseOutboundUrl
} from "../outboundUrlGuard.js";
const DEFAULT_IDEMPOTENT_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];
function resolveProbeTimeoutMs() {
  const parsed = parseInt(process.env.OMNIROUTE_PROVIDER_PROBE_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) && parsed >= 1e3 ? parsed : 8e3;
}
const PROVIDER_PROBE_TIMEOUT_MS = resolveProbeTimeoutMs();
const SAFE_OUTBOUND_FETCH_PRESETS = {
  validationRead: {
    timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [150],
      methods: ["GET", "HEAD"]
    }
  },
  validationWrite: {
    timeoutMs: 15e3,
    allowRedirect: false,
    retry: false
  },
  modelsProbe: {
    timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [150],
      methods: ["GET", "HEAD"]
    }
  },
  modelsDiscovery: {
    timeoutMs: 1e4,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [200],
      methods: ["GET", "HEAD"]
    }
  },
  modelsPagination: {
    timeoutMs: 15e3,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [250],
      methods: ["GET", "HEAD"]
    }
  }
};
class SafeOutboundFetchError extends Error {
  code;
  url;
  method;
  attempts;
  isRetryable;
  timeoutMs;
  status;
  location;
  constructor(message, init) {
    super(message);
    this.name = "SafeOutboundFetchError";
    this.code = init.code;
    this.url = init.url;
    this.method = init.method;
    this.attempts = init.attempts;
    this.isRetryable = init.isRetryable;
    this.timeoutMs = init.timeoutMs;
    this.status = init.status;
    this.location = init.location ?? null;
    if (init.cause !== void 0) {
      this.cause = init.cause;
    }
  }
}
function normalizeMethod(method) {
  return (method || "GET").toUpperCase();
}
function normalizeUrl(input) {
  try {
    return parseOutboundUrl(input);
  } catch (error) {
    if (error instanceof OutboundUrlGuardError) {
      throw new SafeOutboundFetchError(error.message, {
        code: error.code === "OUTBOUND_URL_INVALID" ? "INVALID_URL" : "URL_GUARD_BLOCKED",
        url: error.url,
        method: "GET",
        attempts: 1,
        isRetryable: false,
        cause: error
      });
    }
    throw new SafeOutboundFetchError(`Invalid outbound URL: ${String(input)}`, {
      code: "INVALID_URL",
      url: String(input),
      method: "GET",
      attempts: 1,
      isRetryable: false,
      cause: error
    });
  }
}
function applyUrlGuard(targetUrl, guard, method) {
  if (guard === "none") return;
  try {
    if (guard === "block-metadata") {
      parseAndValidateNonMetadataUrl(targetUrl);
    } else {
      parseAndValidatePublicUrl(targetUrl);
    }
  } catch (error) {
    if (error instanceof OutboundUrlGuardError) {
      throw new SafeOutboundFetchError(error.message, {
        code: error.code === "OUTBOUND_URL_INVALID" ? "INVALID_URL" : "URL_GUARD_BLOCKED",
        url: error.url,
        method,
        attempts: 1,
        isRetryable: false,
        cause: error
      });
    }
    throw error;
  }
}
function getRetryConfig(retry, method) {
  if (retry === false) {
    return {
      attempts: 1,
      shouldRetryMethod: false,
      statusCodes: /* @__PURE__ */ new Set(),
      backoffMs: []
    };
  }
  const methods = new Set(
    (retry?.methods || DEFAULT_IDEMPOTENT_METHODS).map((value) => value.toUpperCase())
  );
  const attempts = Math.max(1, retry?.attempts || 1);
  const backoffMs = Array.isArray(retry?.backoffMs) ? retry?.backoffMs : typeof retry?.backoffMs === "number" ? [retry.backoffMs] : [];
  const statusCodes = new Set(retry?.statusCodes || []);
  return {
    attempts,
    shouldRetryMethod: methods.has(method),
    statusCodes,
    backoffMs
  };
}
function getBackoffDelay(backoffMs, attemptNumber) {
  if (backoffMs.length === 0) return 0;
  return backoffMs[Math.min(attemptNumber - 1, backoffMs.length - 1)] || 0;
}
function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function cancelResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
  }
}
function normalizeFetchFailure(error, targetUrl, method, attempts) {
  if (error instanceof SafeOutboundFetchError) {
    error.attempts = attempts;
    return error;
  }
  if (error instanceof FetchTimeoutError) {
    return new SafeOutboundFetchError(error.message, {
      code: "TIMEOUT",
      url: targetUrl,
      method,
      attempts,
      timeoutMs: error.timeoutMs,
      isRetryable: true,
      cause: error
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" ? error.code : void 0;
  return new SafeOutboundFetchError(message || `Outbound request failed for ${targetUrl}`, {
    code: "NETWORK_ERROR",
    url: targetUrl,
    method,
    attempts,
    isRetryable: code !== "PROXY_UNREACHABLE",
    cause: error
  });
}
async function safeOutboundFetch(url, options = {}) {
  const targetUrl = normalizeUrl(url);
  const method = normalizeMethod(options.method);
  const {
    timeoutMs,
    allowRedirect = false,
    retry,
    guard = "none",
    proxyConfig,
    bypassProxyPatch = false,
    signal,
    ...fetchOptions
  } = options;
  applyUrlGuard(targetUrl, guard, method);
  const retryConfig = getRetryConfig(retry, method);
  const redirect = allowRedirect ? fetchOptions.redirect ?? "follow" : "manual";
  for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
    try {
      const executeFetch = () => fetchWithTimeout(targetUrl.toString(), {
        ...fetchOptions,
        method,
        redirect,
        signal,
        timeoutMs,
        // When bypassing the proxy patch, use the original native fetch directly.
        fetchFn: bypassProxyPatch ? globalThis.fetch : void 0
      });
      // Adapted: dest proxyFetch.js lacks runWithProxyContext/getOriginalFetch,
      // so proxy-context calls go through proxyAwareFetch (same proxy plumbing).
      const response = bypassProxyPatch
        ? await executeFetch()
        : proxyConfig
          ? await proxyAwareFetch(targetUrl.toString(), { ...fetchOptions, method, redirect, signal, timeoutMs }, proxyConfig)
          : await executeFetch();
      if (!allowRedirect && response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await cancelResponseBody(response);
        throw new SafeOutboundFetchError(
          `Redirect blocked for ${method} ${targetUrl.toString()} (${response.status})`,
          {
            code: "REDIRECT_BLOCKED",
            url: targetUrl.toString(),
            method,
            attempts: attempt,
            status: response.status,
            location,
            isRetryable: false
          }
        );
      }
      if (retryConfig.shouldRetryMethod && attempt < retryConfig.attempts && retryConfig.statusCodes.has(response.status)) {
        await cancelResponseBody(response);
        await sleep(getBackoffDelay(retryConfig.backoffMs, attempt));
        continue;
      }
      return response;
    } catch (error) {
      const normalizedError = normalizeFetchFailure(error, targetUrl.toString(), method, attempt);
      const shouldRetry = retryConfig.shouldRetryMethod && attempt < retryConfig.attempts && normalizedError.isRetryable;
      if (!shouldRetry) {
        throw normalizedError;
      }
      await sleep(getBackoffDelay(retryConfig.backoffMs, attempt));
    }
  }
  throw new SafeOutboundFetchError(`Outbound request failed for ${targetUrl.toString()}`, {
    code: "NETWORK_ERROR",
    url: targetUrl.toString(),
    method,
    attempts: retryConfig.attempts,
    isRetryable: false
  });
}
function getSafeOutboundFetchErrorStatus(error) {
  if (!(error instanceof SafeOutboundFetchError)) return null;
  if (error.code === "TIMEOUT") return 504;
  if (error.code === "INVALID_URL" || error.code === "URL_GUARD_BLOCKED" || error.code === "REDIRECT_BLOCKED") {
    return 503;
  }
  return null;
}
export {
  SAFE_OUTBOUND_FETCH_PRESETS,
  SafeOutboundFetchError,
  getSafeOutboundFetchErrorStatus,
  safeOutboundFetch
};
