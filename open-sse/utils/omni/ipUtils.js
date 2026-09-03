// ADAPTED STUB — OmniRoute `src/lib/ipUtils.ts` resolves client IPs from the
// request. Minimal header-based implementation for the speech combo service.
export function getClientIpFromRequest(request) {
  const headers = request?.headers;
  if (!headers) return null;
  const get = (name) => {
    const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
    return typeof v === "string" ? v : null;
  };
  const fwd = get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return get("x-real-ip") || null;
}
