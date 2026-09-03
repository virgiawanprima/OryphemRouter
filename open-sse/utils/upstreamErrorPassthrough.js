const PASSTHROUGH_MIN = 400;
const PASSTHROUGH_MAX = 499;
const EXCLUDED_STATUSES = /* @__PURE__ */ new Set([401, 403, 407]);
const INTERNAL_LEAK_RE = /\sat\s\/|node_modules|omniroute\//i;
const CREDENTIAL_LEAK_RE = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9._-]{8,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|secret)\\?["']?\s*[:=]\s*\\?["']?[^"'\\,\s}]{6,}/i;
function shouldPassthroughUpstreamError(statusCode, upstreamBody) {
  if (statusCode < PASSTHROUGH_MIN || statusCode > PASSTHROUGH_MAX) return false;
  if (EXCLUDED_STATUSES.has(statusCode)) return false;
  if (!upstreamBody || typeof upstreamBody !== "object") return false;
  const text = JSON.stringify(upstreamBody);
  if (INTERNAL_LEAK_RE.test(text)) return false;
  if (CREDENTIAL_LEAK_RE.test(text)) return false;
  return true;
}
function buildPassthroughErrorResponse(statusCode, upstreamBody, headers) {
  if (!shouldPassthroughUpstreamError(statusCode, upstreamBody)) return null;
  return new Response(JSON.stringify(upstreamBody), {
    status: statusCode,
    headers: { "Content-Type": "application/json", ...headers || {} }
  });
}
export {
  buildPassthroughErrorResponse,
  shouldPassthroughUpstreamError
};
