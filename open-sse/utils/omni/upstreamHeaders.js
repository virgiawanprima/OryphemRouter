// ADAPTED — graceful fallback (was @/shared/constants/upstreamHeaders).
const FORBIDDEN = new Set([
  "authorization", "proxy-authorization", "cookie", "set-cookie", "set-cookie2",
  "host", "content-length", "transfer-encoding", "connection", "keep-alive",
  "upgrade", "te", "trailer", "proxy-authenticate", "www-authenticate",
]);
export function isForbiddenUpstreamHeaderName(name) {
  return FORBIDDEN.has(String(name || "").trim().toLowerCase());
}
export function isForbiddenCustomHeaderName(name) {
  return FORBIDDEN.has(String(name || "").trim().toLowerCase());
}