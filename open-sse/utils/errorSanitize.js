// Ported from OmniRoute utils/error.ts (sanitizeErrorMessage + helpers).
// Kept as a separate leaf so executors can import it without the heavy error.js graph.
const MAX_ERROR_LEN = 4096;

function looksLikeAbsolutePath(tok) {
  if (tok.length < 4 || tok.length > 2048) return false;
  const isPosix = tok.charCodeAt(0) === 0x2f; // '/'
  const isWindows = tok.length > 2 && tok.charCodeAt(1) === 0x3a && /[A-Za-z]/.test(tok[0]);
  if (!isPosix && !isWindows) return false;
  const dot = tok.lastIndexOf(".");
  if (dot <= 0 || dot === tok.length - 1) return false;
  const ext = tok
    .slice(dot + 1)
    .split(":", 1)[0]
    .toLowerCase();
  return /^[a-z0-9]+$/.test(ext);
}

export function redactSensitiveErrorText(value) {
  return value
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=_-]+/gi, "[REDACTED_DATA_URL]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(
      /(["']?(?:api[_-]?key|access[_-]?token|authorization|cookie|secret)["']?\s*[:=]\s*["'])[^"']*(["'])/gi,
      "$1[REDACTED]$2"
    )
    .replace(
      /(["']?(?:api[_-]?key|access[_-]?token|authorization|cookie|secret)["']?\s*[:=]\s*)[^"',\s}]+/gi,
      "$1[REDACTED]"
    );
}

export function sanitizeErrorMessage(message) {
  let str = typeof message === "string" ? message : String(message ?? "");
  if (str.length > MAX_ERROR_LEN) str = str.slice(0, MAX_ERROR_LEN);
  const nl = str.indexOf("\n");
  const firstLine = nl >= 0 ? str.slice(0, nl) : str;
  const parts = firstLine.split(/(\s+)/);
  for (let i = 0; i < parts.length; i++) {
    if (looksLikeAbsolutePath(parts[i])) parts[i] = "<path>";
  }
  return redactSensitiveErrorText(parts.join(""));
}

// makeExecutorErrorResult — ported from OmniRoute utils/error.ts.
export function makeExecutorErrorResult(status, message, body, url) {
  return {
    response: new Response(
      JSON.stringify({
        error: {
          message: sanitizeErrorMessage(message),
          type: "upstream_error",
          code: `HTTP_${status}`,
        },
      }),
      { status, headers: { "Content-Type": "application/json" } }
    ),
    url,
    headers: {},
    transformedBody: body,
  };
}

// buildErrorBody / errorResponse — simplified port of OmniRoute utils/error.ts,
// so web executors can build OpenAI-style upstream errors without the heavy error.js graph.
function errorInfoFor(statusCode) {
  const map = {
    401: { type: "authentication_error", code: "invalid_api_key" },
    403: { type: "permission_error", code: "insufficient_permission" },
    404: { type: "invalid_request_error", code: "model_not_found" },
    429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
    499: { type: "invalid_request_error", code: "request_cancelled" },
    502: { type: "server_error", code: "bad_gateway" },
    503: { type: "server_error", code: "service_unavailable" },
  };
  return (
    map[statusCode] ||
    (statusCode >= 500
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" })
  );
}

export function buildErrorBody(statusCode, message, upstreamDetails, classification) {
  const info = errorInfoFor(statusCode);
  const body = {
    error: {
      message: sanitizeErrorMessage(message) || "An error occurred",
      type: classification?.type ?? info.type,
      code: classification?.code ?? info.code,
      ...(classification?.reason ? { reason: classification.reason } : {}),
    },
  };
  if (upstreamDetails != null && typeof upstreamDetails === "object") {
    body.upstream_details = upstreamDetails;
  }
  return body;
}

export function errorResponse(statusCode, message) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

export function normalizeCookie(raw) {
  return raw?.startsWith("Cookie:") ? raw.slice(7).trim() : raw || "";
}
