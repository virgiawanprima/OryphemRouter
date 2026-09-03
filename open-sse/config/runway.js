const RUNWAYML_DEFAULT_BASE_URL = "https://api.dev.runwayml.com/v1";
const RUNWAYML_API_VERSION = "2024-11-06";
const RUNWAYML_SUPPORTED_VIDEO_MODELS = [
  { id: "gen4.5", name: "Gen-4.5" },
  { id: "gen4_turbo", name: "Gen-4 Turbo" },
  { id: "gen3a_turbo", name: "Gen-3 Alpha Turbo" },
  { id: "veo3.1", name: "Veo 3.1" },
  { id: "veo3.1_fast", name: "Veo 3.1 Fast" }
];
const RUNWAYML_IMAGE_REQUIRED_MODELS = /* @__PURE__ */ new Set(["gen4_turbo"]);
function normalizeRunwayBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!normalized) return RUNWAYML_DEFAULT_BASE_URL;
  const stripped = normalized.replace(/\/organization$/i, "").replace(/\/tasks\/[^/]+$/i, "").replace(/\/(?:image_to_video|text_to_video)$/i, "");
  return stripped.endsWith("/v1") ? stripped : `${stripped}/v1`;
}
function buildRunwayApiUrl(path, baseUrl) {
  const normalizedBaseUrl = normalizeRunwayBaseUrl(baseUrl);
  return `${normalizedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
function buildRunwayHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAYML_API_VERSION
  };
}
export {
  RUNWAYML_API_VERSION,
  RUNWAYML_DEFAULT_BASE_URL,
  RUNWAYML_IMAGE_REQUIRED_MODELS,
  RUNWAYML_SUPPORTED_VIDEO_MODELS,
  buildRunwayApiUrl,
  buildRunwayHeaders,
  normalizeRunwayBaseUrl
};
