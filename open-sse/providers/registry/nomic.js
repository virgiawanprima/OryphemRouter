// Nomic — OpenAI-compatible /v1/embeddings (Nomic Atlas API). Free tier available.
export default {
  id: "nomic",
  alias: "nomic",
  display: {
    name: "Nomic",
    icon: "hub",
    color: "#7C3AED",
    textIcon: "NM",
    website: "https://nomic.ai",
    notice: {
      apiKeyUrl: "https://atlas.nomic.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: null,
  models: [
    { id: "nomic-embed-text-v1.5", name: "Nomic Embed Text v1.5", dimensions: 768, kind: "embedding" },
    { id: "nomic-embed-vision-v1.5", name: "Nomic Embed Vision v1.5", dimensions: 768, kind: "embedding" },
  ],
  serviceKinds: ["embedding"],
  embeddingConfig: { baseUrl: "https://api.nomic.ai/v1/embeddings", authType: "apikey", authHeader: "bearer" },
};
