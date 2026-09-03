export default {
  id: "aion",
  display: {
    name: "AION",
    icon: "flare",
    color: "#7C3AED",
    textIcon: "AI",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.aionlabs.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.aionlabs.ai/v1/models",
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
      id: "aion-labs/aion-3.0",
      name: "Aion 3.0",
      contextLength: 131072,
    },
    {
      id: "aion-labs/aion-3.0-mini",
      name: "Aion 3.0 Mini",
      contextLength: 131072,
    },
    {
      id: "aion-labs/aion-2.5",
      name: "Aion 2.5",
      contextLength: 131072,
    },
    {
      id: "aion-labs/aion-2.0",
      name: "Aion 2.0",
      contextLength: 131072,
    },
    {
      id: "aion-labs/aion-rp-llama-3.1-8b",
      name: "Aion RP Llama 3.1 8B",
      contextLength: 32768,
    },
  ],
  passthroughModels: true,
};
