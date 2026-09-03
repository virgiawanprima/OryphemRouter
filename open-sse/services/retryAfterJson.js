function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function positiveCappedMs(value, maxMs) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(value, maxMs) : null;
}
function futureTimestampMs(value, maxMs) {
  if (typeof value !== "string") return null;
  const parsedTs = Date.parse(value);
  if (!Number.isFinite(parsedTs)) return null;
  const waitMs = parsedTs - Date.now();
  return waitMs > 0 ? Math.min(waitMs, maxMs) : null;
}
const MAX_SHORT_RETRY_HINT_MS = 24 * 60 * 60 * 1e3;
function parseDelayString(value) {
  if (!value) return null;
  const str = String(value).trim();
  const msMatch = /^(\d+(?:\.\d+)?)\s*ms$/i.exec(str);
  if (msMatch) return Math.round(Number.parseFloat(msMatch[1]));
  const secMatch = /^(\d+(?:\.\d+)?)\s*s$/i.exec(str);
  if (secMatch) return Math.round(Number.parseFloat(secMatch[1]) * 1e3);
  const minMatch = /^(\d+(?:\.\d+)?)\s*m$/i.exec(str);
  if (minMatch) return Math.round(Number.parseFloat(minMatch[1]) * 60 * 1e3);
  const hrMatch = /^(\d+(?:\.\d+)?)\s*h$/i.exec(str);
  if (hrMatch) return Math.round(Number.parseFloat(hrMatch[1]) * 3600 * 1e3);
  const num = Number.parseFloat(str);
  return Number.isFinite(num) ? Math.round(num * 1e3) : null;
}
function retryInfoDetailsMs(details) {
  for (const detail of Array.isArray(details) ? details : []) {
    const detailRecord = objectRecord(detail);
    const type = String(detailRecord["@type"] ?? "");
    if (!type.includes("RetryInfo")) continue;
    const ms = parseDelayString(detailRecord.retryDelay);
    if (ms !== null && ms > 0) return Math.min(ms, MAX_SHORT_RETRY_HINT_MS);
  }
  return null;
}
function parseRetryHintFromJsonBody(body, maxMs) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const root = objectRecord(parsed);
  if (!Object.keys(root).length) return null;
  const errorObj = objectRecord(root.error);
  const retryInfoMs = retryInfoDetailsMs(errorObj.details ?? root.details);
  if (retryInfoMs !== null) return retryInfoMs;
  const isoHint = futureTimestampMs(errorObj.retryAfter ?? root.retryAfter, maxMs);
  if (isoHint !== null) return isoHint;
  return positiveCappedMs(
    errorObj.retry_after_ms ?? root.retry_after_ms ?? errorObj.retryAfterMs ?? root.retryAfterMs,
    maxMs
  );
}
export {
  MAX_SHORT_RETRY_HINT_MS,
  parseDelayString,
  parseRetryHintFromJsonBody
};
