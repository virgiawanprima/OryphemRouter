// ADAPTED STUB (was config/runway.ts). Minimal URL/header builders.
export const RUNWAYML_IMAGE_REQUIRED_MODELS = [];
export function buildRunwayApiUrl(baseUrl, path = "") {
  const base = String(baseUrl || "https://api.dev.runwayml.com/v1").replace(/\/$/, "");
  return base + (path ? "/" + path.replace(/^\//, "") : "");
}
export function buildRunwayHeaders(credentials, extra = {}) {
  const headers = { ...extra };
  if (credentials && (credentials.apiKey || credentials.accessToken)) {
    headers["Authorization"] = "Bearer " + (credentials.apiKey || credentials.accessToken);
  }
  return headers;
}
