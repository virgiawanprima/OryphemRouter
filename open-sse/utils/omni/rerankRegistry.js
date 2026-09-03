// ADAPTED STUB (was config/rerankRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "cohere": {
    "id": "cohere",
    "format": "cohere-rerank",
    "baseUrl": "https://api.cohere.com",
    "models": [
      {
        "id": "rerank-v3.5"
      }
    ]
  },
  "jina": {
    "id": "jina",
    "format": "jina-rerank",
    "baseUrl": "https://api.jina.ai",
    "models": [
      {
        "id": "jina-reranker-v2"
      }
    ]
  },
  "voyage": {
    "id": "voyage",
    "format": "voyage-rerank",
    "baseUrl": "https://api.voyageai.com",
    "models": [
      {
        "id": "rerank-2"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseRerankModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getRerankProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export const RERANK_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
