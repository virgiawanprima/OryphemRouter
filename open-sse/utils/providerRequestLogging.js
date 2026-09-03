import { AsyncLocalStorage } from "node:async_hooks";
import { updatePendingScope } from "./omni/pendingRequestScope.js";
const CAPTURE_STATE_KEY = Symbol.for("omniroute.providerRequestCapture.state");
function getCaptureState() {
  const scopedGlobal = globalThis;
  if (!scopedGlobal[CAPTURE_STATE_KEY]) {
    scopedGlobal[CAPTURE_STATE_KEY] = {
      context: new AsyncLocalStorage(),
      wrappedFetch: null,
      wrappedInnerFetch: null
    };
  }
  return scopedGlobal[CAPTURE_STATE_KEY];
}
const captureState = getCaptureState();
const BODY_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH"]);
const AUTH_BODY_KEYS = /* @__PURE__ */ new Set([
  "access_token",
  "client_secret",
  "grant_type",
  "id_token",
  "refresh_token"
]);
const REQUEST_BODY_KEYS = /* @__PURE__ */ new Set([
  "conversationId",
  "conversation_id",
  "contents",
  "input",
  "messages",
  "model",
  "prompt",
  "request",
  "tools",
  "userSelectedModel"
]);
function parseBody(bodyString) {
  try {
    return JSON.parse(bodyString);
  } catch {
    return bodyString;
  }
}
async function capturePreparedRequest(requestCapture, url, headers, body, bodyString, log) {
  if (!requestCapture) return;
  const latest = requestCapture.latest?.();
  if (latest?.url === url && latest.bodyString === bodyString) return;
  try {
    await requestCapture.capture({ url, headers, body, bodyString });
  } catch (error) {
    log?.warn?.(
      "REQUEST_LOG",
      `Provider request logging hook failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function captureCurrentProviderRequest(url, headers, body, bodyString, log) {
  return capturePreparedRequest(
    captureState.context.getStore(),
    url,
    headers,
    body,
    bodyString,
    log
  );
}
function captureCurrentProviderBody(url, headers, bodyString, log) {
  return captureCurrentProviderRequest(url, headers, parseBody(bodyString), bodyString, log);
}
function runWithCapture(requestCapture, fn) {
  installFetchCapture();
  return captureState.context.run(requestCapture, fn);
}
function installFetchCapture() {
  // Skip in Vitest: tests stub globalThis.fetch for deterministic network, and a
  // global capture wrapper would clobber those stubs (same reason as proxyFetch).
  if (typeof process !== "undefined" && !!process.env.VITEST) return;
  if (globalThis.fetch === captureState.wrappedFetch) return;
  captureState.wrappedInnerFetch = globalThis.fetch.bind(globalThis);
  captureState.wrappedFetch = async (input, init) => {
    const activeCapture = captureState.context.getStore();
    if (activeCapture) {
      await captureFetchRequest(activeCapture, input, init);
    }
    return captureState.wrappedInnerFetch(input, init);
  };
  globalThis.fetch = captureState.wrappedFetch;
}
async function captureFetchRequest(requestCapture, input, init) {
  const method = getFetchMethod(input, init);
  if (!BODY_METHODS.has(method)) return;
  const bodyString = bodyToString(init?.body);
  if (!bodyString) return;
  const body = parseBody(bodyString);
  if (!looksLikeProviderRequestBody(body)) return;
  await capturePreparedRequest(
    requestCapture,
    getFetchUrl(input),
    getFetchHeaders(input, init),
    body,
    bodyString
  );
}
function getFetchMethod(input, init) {
  const method = init?.method || (isRequest(input) ? input.method : "GET");
  return String(method || "GET").toUpperCase();
}
function getFetchUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (isRequest(input)) return input.url;
  return String(input);
}
function getFetchHeaders(input, init) {
  const headers = new Headers(isRequest(input) ? input.headers : void 0);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
function bodyToString(body) {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    );
  }
  return null;
}
function isRequest(input) {
  return typeof Request !== "undefined" && input instanceof Request;
}
function looksLikeProviderRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body;
  if (Object.keys(record).some((key) => AUTH_BODY_KEYS.has(key))) return false;
  if (Object.keys(record).some((key) => REQUEST_BODY_KEYS.has(key))) return true;
  return typeof record.query === "string" && !!record.variables && typeof record.variables === "object";
}
function createPreparedRequestLogger(reqLogger, scope) {
  let latest = null;
  return {
    capture(request) {
      latest = request;
      reqLogger.logTargetRequest(request.url, request.headers, request.body);
      updatePendingScope(scope, {
        providerRequest: request.body,
        providerUrl: request.url,
        stage: "sending_to_provider"
      });
    },
    body(fallback) {
      const resolved = latest?.body ?? fallback;
      if (resolved !== fallback && resolved && typeof resolved === "object" && fallback && typeof fallback === "object") {
        const map = fallback._toolNameMap;
        const target = resolved;
        if (map instanceof Map && !(target._toolNameMap instanceof Map)) {
          Object.defineProperty(target, "_toolNameMap", {
            value: map,
            enumerable: false,
            configurable: true,
            writable: true
          });
        }
      }
      return resolved;
    },
    latest() {
      return latest;
    }
  };
}
export {
  captureCurrentProviderBody,
  captureCurrentProviderRequest,
  createPreparedRequestLogger,
  parseBody,
  runWithCapture
};
