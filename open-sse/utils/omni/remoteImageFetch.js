// ADAPTED STUB (was @/shared/network/remoteImageFetch). Uses global fetch without the
// DNS/SSRF guard layer. Graceful fallback.
export async function fetchRemoteImage(url, options = {}) {
  const res = await fetch(url, { redirect: "follow", ...options });
  if (!res.ok) throw new Error("fetchRemoteImage failed: " + res.status);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get("content-type") || "application/octet-stream" };
}
