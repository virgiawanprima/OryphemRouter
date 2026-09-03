// ADAPTED STUB — ported from OmniRoute open-sse/executors/base/headers.ts
// OryphemRouter's executors/base.js is a trimmed port that lacks the upstream
// header helpers. This leaf provides `setUserAgentHeader` (needed by
// opencodeHeaders.js) plus the closely related header helpers, verbatim.
function getCustomUserAgent(providerSpecificData) {
  const customUserAgent =
    typeof providerSpecificData?.customUserAgent === "string"
      ? providerSpecificData.customUserAgent.trim()
      : "";
  return customUserAgent || null;
}

export function setUserAgentHeader(headers, userAgent) {
  headers["User-Agent"] = userAgent;
  if ("user-agent" in headers) {
    headers["user-agent"] = userAgent;
  }
}

export function applyConfiguredUserAgent(headers, providerSpecificData) {
  const customUserAgent = getCustomUserAgent(providerSpecificData);
  if (customUserAgent) {
    setUserAgentHeader(headers, customUserAgent);
  }
}

export function mergeUpstreamExtraHeaders(headers, extra) {
  if (!extra) return;
  for (const [k, v] of Object.entries(extra)) {
    if (typeof k === "string" && k.length > 0 && typeof v === "string") {
      if (k.toLowerCase() === "user-agent") {
        setUserAgentHeader(headers, v);
        continue;
      }
      headers[k] = v;
    }
  }
}
