// ADAPTED STUB (was config/embeddingRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "openai": {
    "id": "openai",
    "format": "openai-embedding",
    "baseUrl": "https://api.openai.com/v1",
    "models": [
      {
        "id": "text-embedding-3-small"
      },
      {
        "id": "text-embedding-3-large"
      }
    ]
  },
  "gemini": {
    "id": "gemini",
    "format": "gemini-embedding",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "models": [
      {
        "id": "gemini-embedding-2"
      }
    ]
  },
  "jina": {
    "id": "jina",
    "format": "jina-embedding",
    "baseUrl": "https://api.jina.ai",
    "models": [
      {
        "id": "jina-embeddings-v3"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseEmbeddingModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getEmbeddingProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export const EMBEDDING_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
