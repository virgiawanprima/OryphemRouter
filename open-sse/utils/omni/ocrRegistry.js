// ADAPTED STUB (was config/ocrRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "mistral": {
    "id": "mistral",
    "format": "mistral-ocr",
    "baseUrl": "https://api.mistral.ai/v1",
    "models": [
      {
        "id": "mistral-ocr-latest"
      }
    ]
  },
  "jina": {
    "id": "jina",
    "format": "jina-ocr",
    "baseUrl": "https://api.jina.ai",
    "models": [
      {
        "id": "jina-reader"
      }
    ]
  },
  "gemini": {
    "id": "gemini",
    "format": "gemini-ocr",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "models": [
      {
        "id": "gemini-2.5-flash"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseOcrModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getOcrProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export function getOcrTransformation(p) {
  const prov = PROVIDERS[normalizeProviderId(p)];
  return prov ? { format: prov.format, baseUrl: prov.baseUrl } : null;
}
export const OCR_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
