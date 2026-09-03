export default {
  id: "sealion",
  display: {
    name: "Sea Lion",
    icon: "waves",
    color: "#0EA5E9",
    textIcon: "SL",
    website: "https://aisingapore.org",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.sea-lion.ai/v1/chat/completions",
    validateUrl: "https://api.sea-lion.ai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "aisingapore/Llama-SEA-LION-v3.5-70B-R",
      name: "Llama SEA-LION v3.5 70B R",
      contextLength: 131072,
    },
    {
      id: "aisingapore/Llama-SEA-LION-v3-70B-IT",
      name: "Llama SEA-LION v3 70B IT",
      contextLength: 131072,
    },
    {
      id: "aisingapore/Gemma-SEA-LION-v4-27B-IT",
      name: "Gemma SEA-LION v4 27B IT",
      contextLength: 131072,
    },
    {
      id: "aisingapore/Qwen-SEA-LION-v4.5-27B-IT",
      name: "Qwen SEA-LION v4.5 27B IT",
      contextLength: 32768,
    },
    {
      id: "aisingapore/Qwen-SEA-LION-v4-32B-IT",
      name: "Qwen SEA-LION v4 32B IT",
      contextLength: 32768,
    },
  ],
};
