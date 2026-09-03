export default {
  id: "g4f-ollama",
  alias: "g4foll",
  display: {
    name: "G4F Ollama",
    icon: "bolt",
    color: "#111827",
    textIcon: "G4O",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://g4f.space/api/ollama/v1/chat/completions",
    modelsFetcher: {
      url: "https://g4f.space/api/ollama/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "gemma3:4b",
      name: "Gemma 3 4B (g4f/Ollama)",
    },
  ],
  passthroughModels: true,
};
