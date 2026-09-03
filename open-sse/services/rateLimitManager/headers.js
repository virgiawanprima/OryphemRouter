const STANDARD_HEADERS = {
  limit: "x-ratelimit-limit-requests",
  remaining: "x-ratelimit-remaining-requests",
  reset: "x-ratelimit-reset-requests",
  limitTokens: "x-ratelimit-limit-tokens",
  remainingTokens: "x-ratelimit-remaining-tokens",
  resetTokens: "x-ratelimit-reset-tokens",
  retryAfter: "retry-after",
  overLimit: "x-ratelimit-over-limit"
};
const ANTHROPIC_HEADERS = {
  limit: "anthropic-ratelimit-requests-limit",
  remaining: "anthropic-ratelimit-requests-remaining",
  reset: "anthropic-ratelimit-requests-reset",
  limitTokens: "anthropic-ratelimit-input-tokens-limit",
  remainingTokens: "anthropic-ratelimit-input-tokens-remaining",
  resetTokens: "anthropic-ratelimit-input-tokens-reset",
  retryAfter: "retry-after"
};
function parseResetTime(value) {
  if (!value) return null;
  const durationMatch = value.match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?(?:(\d+)ms)?$/);
  if (durationMatch) {
    const [, h, m, s, ms] = durationMatch;
    return (parseInt(h || 0) * 3600 + parseInt(m || 0) * 60 + parseInt(s || 0)) * 1e3 + parseInt(ms || 0);
  }
  const num = parseFloat(value);
  if (!isNaN(num) && num > 0) {
    if (num > 17e8) {
      return Math.max(0, num * 1e3 - Date.now());
    }
    return num * 1e3;
  }
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  } catch {
  }
  return null;
}
function toPlainHeaders(headers) {
  if (!headers) return {};
  const plain = {};
  const obj = headers;
  if (typeof obj.forEach === "function") {
    try {
      obj.forEach((v, k) => {
        plain[k.toLowerCase()] = v;
      });
      return plain;
    } catch {
    }
  }
  if (typeof obj.entries === "function") {
    try {
      for (const [k, v] of obj.entries()) {
        plain[k.toLowerCase()] = v;
      }
      return plain;
    } catch {
    }
  }
  try {
    for (const [k, v] of Object.entries(obj)) {
      plain[k.toLowerCase()] = v == null ? "" : String(v);
    }
  } catch {
  }
  return plain;
}
export {
  ANTHROPIC_HEADERS,
  STANDARD_HEADERS,
  parseResetTime,
  toPlainHeaders
};
