// ADAPTED STUB (was config/upscaleRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "adobe-firefly": {
    "id": "adobe-firefly",
    "format": "adobe-firefly-upscale",
    "baseUrl": "https://firefly-api.adobe.io",
    "models": [
      {
        "id": "topaz-bloom"
      },
      {
        "id": "topaz-photo"
      }
    ]
  },
  "stability": {
    "id": "stability",
    "format": "stability-upscale",
    "baseUrl": "https://api.stability.ai",
    "models": [
      {
        "id": "esrgan-v1-x2plus"
      },
      {
        "id": "creative-upscale"
      },
      {
        "id": "conservative-upscale"
      }
    ]
  },
  "topaz": {
    "id": "topaz",
    "format": "topaz-upscale",
    "baseUrl": "https://api.topazlabs.com",
    "models": [
      {
        "id": "gigapixel"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseUpscaleModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getUpscaleProvider(provider) {
  return PROVIDERS[normalizeProviderId(provider)] || null;
}
export const UPSCALE_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
