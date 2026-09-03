import {
  attachOmniRouteMetaHeaders
} from "../../utils/omni/omnirouteResponseMeta.js";
import { OMNIROUTE_RESPONSE_HEADERS } from "../../utils/omni/omniHeaders.js";
import { defaultLogger } from "../../utils/omni/logger.js";
const STREAMING_RESPONSE_HEADER_DENYLIST = /* @__PURE__ */ new Set([
  "content-type",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "cache-control",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "upgrade",
  "authorization",
  "authentication-info",
  "cookie",
  "set-cookie",
  "set-cookie2",
  "www-authenticate",
  "x-api-key",
  "x-amz-security-token",
  "x-auth-token",
  "x-accel-buffering"
]);
const CODEX_TURN_STATE_RESPONSE_HEADER = "x-codex-turn-state";
const DEFAULT_FORWARDED_HEADER_BUDGET_BYTES = 768;
function resolveForwardedHeaderBudget(env) {
  const parsed = Number.parseInt(
    String(env ?? process.env.OMNIROUTE_FORWARDING_HEADER_BUDGET_BYTES),
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FORWARDED_HEADER_BUDGET_BYTES;
}
const MAX_FORWARDED_UPSTREAM_RESPONSE_HEADER_BYTES = resolveForwardedHeaderBudget();
const MAX_LOGGED_DROPPED_RESPONSE_HEADERS = 20;
const responseHeaderEncoder = new TextEncoder();
const DROPPED_HEADER_WARN_FINGERPRINT_LIMIT = 1e3;
const droppedHeaderWarnFingerprints = /* @__PURE__ */ new Set();
function fingerprintDroppedHeaders(dropped) {
  return dropped.map((header) => header.name.toLowerCase()).sort().join(",");
}
function resetDroppedHeaderWarnFingerprints() {
  droppedHeaderWarnFingerprints.clear();
}
function responseHeaderWireBytes(name, value) {
  return responseHeaderEncoder.encode(`${name}: ${value}\r
`).byteLength;
}
function isOmniRouteInternalHeader(headerName) {
  return headerName.toLowerCase().startsWith("x-omniroute-");
}
function getForwardingPriority(headerName) {
  const normalized = headerName.toLowerCase();
  if (normalized === "x-request-id" || normalized === "request-id" || normalized === "x-correlation-id" || normalized === "traceparent" || normalized === "traceresponse") {
    return 0;
  }
  if (normalized === "retry-after") return 1;
  if (normalized.includes("ratelimit") || normalized.includes("rate-limit")) return 2;
  if (normalized.startsWith("x-codex-") && (normalized.includes("used-percent") || normalized.includes("reset") || normalized.includes("window") || normalized.includes("credits") || normalized.includes("over-secondary") || normalized.includes("plan-type"))) {
    return 2;
  }
  if (normalized === "date" || normalized === "vary" || normalized === "x-robots-tag" || normalized === "content-security-policy" || normalized.startsWith("cf-") || normalized.endsWith("-organization-id") || normalized.endsWith("-workspace-id")) {
    return 4;
  }
  return 3;
}
const NEXTJS_MIDDLEWARE_HEADER_PREFIX = "x-middleware-";
function isNextMiddlewareControlHeader(headerName) {
  return headerName.toLowerCase().startsWith(NEXTJS_MIDDLEWARE_HEADER_PREFIX);
}
function stripNextMiddlewareControlHeaders(headers) {
  const toDelete = [];
  headers.forEach((_value, key) => {
    if (isNextMiddlewareControlHeader(key)) {
      toDelete.push(key);
    }
  });
  for (const key of toDelete) {
    headers.delete(key);
  }
}
function buildStreamingResponseHeaders(providerHeaders, meta, log = defaultLogger) {
  const connectionScopedHeaders = new Set(
    (providerHeaders.get("connection") || "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean)
  );
  const candidates = [];
  let position = 0;
  providerHeaders.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (STREAMING_RESPONSE_HEADER_DENYLIST.has(normalized) || connectionScopedHeaders.has(normalized) || isNextMiddlewareControlHeader(normalized) || isOmniRouteInternalHeader(normalized) || // Forwarded separately below, outside the byte budget.
    normalized === CODEX_TURN_STATE_RESPONSE_HEADER) {
      return;
    }
    candidates.push({
      key,
      value,
      bytes: responseHeaderWireBytes(key, value),
      priority: getForwardingPriority(key),
      position: position++
    });
  });
  candidates.sort((a, b) => a.priority - b.priority || a.position - b.position);
  const forwardedHeaders = [];
  const droppedHeaders = [];
  let forwardedBytes = 0;
  for (const candidate of candidates) {
    if (forwardedBytes + candidate.bytes <= MAX_FORWARDED_UPSTREAM_RESPONSE_HEADER_BYTES) {
      forwardedHeaders.push([candidate.key, candidate.value]);
      forwardedBytes += candidate.bytes;
    } else {
      droppedHeaders.push({ name: candidate.key, bytes: candidate.bytes });
    }
  }
  if (droppedHeaders.length > 0) {
    const dropPayload = {
      budgetBytes: MAX_FORWARDED_UPSTREAM_RESPONSE_HEADER_BYTES,
      forwardedBytes,
      droppedCount: droppedHeaders.length,
      droppedHeaders: droppedHeaders.slice(0, MAX_LOGGED_DROPPED_RESPONSE_HEADERS)
    };
    const fingerprint = fingerprintDroppedHeaders(droppedHeaders);
    if (droppedHeaderWarnFingerprints.has(fingerprint)) {
      log?.debug?.(
        "HTTP",
        "Dropped upstream response headers that exceeded forwarding budget (already warned once for this drop set)",
        dropPayload
      );
    } else {
      if (droppedHeaderWarnFingerprints.size >= DROPPED_HEADER_WARN_FINGERPRINT_LIMIT) {
        droppedHeaderWarnFingerprints.clear();
      }
      droppedHeaderWarnFingerprints.add(fingerprint);
      log?.warn?.(
        "HTTP",
        "Dropped upstream response headers that exceeded forwarding budget",
        dropPayload
      );
    }
  }
  const responseHeaders = {
    ...Object.fromEntries(forwardedHeaders),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    [OMNIROUTE_RESPONSE_HEADERS.cache]: "MISS"
  };
  const codexTurnState = providerHeaders.get(CODEX_TURN_STATE_RESPONSE_HEADER)?.trim();
  if (codexTurnState) {
    responseHeaders[CODEX_TURN_STATE_RESPONSE_HEADER] = codexTurnState;
  }
  attachOmniRouteMetaHeaders(responseHeaders, meta);
  return responseHeaders;
}
function materializeDeduplicatedExecutionResult(result) {
  const snapshot = result && typeof result === "object" ? result._dedupSnapshot : void 0;
  if (!snapshot) return result;
  return {
    ...result,
    response: new Response(snapshot.payload, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    })
  };
}
function stripStaleForwardingHeaders(headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
}
export {
  MAX_FORWARDED_UPSTREAM_RESPONSE_HEADER_BYTES,
  buildStreamingResponseHeaders,
  fingerprintDroppedHeaders,
  isNextMiddlewareControlHeader,
  materializeDeduplicatedExecutionResult,
  resetDroppedHeaderWarnFingerprints,
  resolveForwardedHeaderBudget,
  stripNextMiddlewareControlHeaders,
  stripStaleForwardingHeaders
};
