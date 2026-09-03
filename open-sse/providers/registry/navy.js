export default {
  id: "navy",
  display: {
    name: "Navy",
    icon: "directions_boat",
    color: "#1D4ED8",
    textIcon: "NV",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.navy/v1/chat/completions",
    headers: {
      "User-Agent": "OmniRoute/1.0",
    },
    modelsFetcher: {
      url: "https://api.navy/v1/models",
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
      id: "llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct",
      contextLength: 131072,
      toolCalling: true,
    },
    {
      id: "gemma-4-31b-it",
      name: "Gemma 4 31B IT",
      contextLength: 262144,
      toolCalling: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      contextLength: 1048576,
      toolCalling: true,
      supportsReasoning: true,
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek Chat",
      contextLength: 131072,
      toolCalling: true,
    },
    {
      id: "mistral-small-latest",
      name: "Mistral Small",
      contextLength: 262144,
      toolCalling: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: "llama-4-scout",
      name: "Llama 4 Scout",
      contextLength: 10000000,
      toolCalling: true,
      supportsVision: true,
    },
  ],
  passthroughModels: true,
};
