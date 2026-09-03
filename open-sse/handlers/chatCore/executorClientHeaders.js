function buildExecutorClientHeaders(headers, userAgent) {
  const normalized = {};
  const isLeaseControlHeader = (key) => {
    const lowerKey = key.toLowerCase();
    return lowerKey === "x-omniroute-lease-owner" || lowerKey === "x-omniroute-lease-generation";
  };
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      if (isLeaseControlHeader(key)) return;
      normalized[key] = value;
    });
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (isLeaseControlHeader(key)) continue;
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }
  }
  const normalizedUserAgent = typeof userAgent === "string" ? userAgent.trim() : "";
  if (normalizedUserAgent && !normalized["user-agent"] && !normalized["User-Agent"]) {
    normalized["user-agent"] = normalizedUserAgent;
    normalized["User-Agent"] = normalizedUserAgent;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}
export {
  buildExecutorClientHeaders
};
