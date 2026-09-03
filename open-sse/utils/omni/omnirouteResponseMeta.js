// ADAPTED STUB (was @/domain/omnirouteResponseMeta). Attaches a minimal response meta header.
export function attachOmniRouteMetaHeaders(headers, meta = {}) {
  if (!headers || typeof headers !== "object") return headers;
  if (meta && typeof meta === "object") {
    if (meta.requestId && !headers["x-omniroute-request-id"]) headers["x-omniroute-request-id"] = meta.requestId;
    if (meta.provider && !headers["x-omniroute-provider"]) headers["x-omniroute-provider"] = String(meta.provider);
  }
  return headers;
}

// Added for speechCombo port — wraps a Response with the meta headers.
export function attachOmniRouteMetaToResponse(response, meta = {}) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  if (meta && typeof meta === "object") {
    if (meta.requestId && !headers.has("x-omniroute-request-id")) headers.set("x-omniroute-request-id", String(meta.requestId));
    if (meta.provider && !headers.has("x-omniroute-provider")) headers.set("x-omniroute-provider", String(meta.provider));
    if (meta.model && !headers.has("x-omniroute-model")) headers.set("x-omniroute-model", String(meta.model));
    if (meta.strategy && !headers.has("x-omniroute-strategy")) headers.set("x-omniroute-strategy", String(meta.strategy));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Added for chatCore/responseHeaders.ts port.
export function buildOmniRouteResponseMetaHeaders(meta = {}) {
  const headers = {};
  if (meta && typeof meta === "object") {
    if (meta.provider) headers["x-omniroute-provider"] = String(meta.provider);
    if (meta.model) headers["x-omniroute-model"] = String(meta.model);
    if (meta.requestId) headers["x-omniroute-request-id"] = String(meta.requestId);
    if (typeof meta.cacheHit === "boolean") headers["x-omniroute-cache-hit"] = String(meta.cacheHit);
    if (typeof meta.latencyMs === "number") headers["x-omniroute-latency-ms"] = String(meta.latencyMs);
    if (meta.strategy) headers["x-omniroute-strategy"] = String(meta.strategy);
  }
  return headers;
}
