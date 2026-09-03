export default {
  id: "freetheai",
  priority: 300,
  alias: "fta",
  
  display: {
    name: "FreeTheAI",
    color: "#34D399",
    textIcon: "FR",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.freetheai.xyz/v1/chat/completions",
    validateUrl: "https://api.freetheai.xyz/v1/models",

  },
  passthroughModels: true,

  models: [
  {
    "id": "gpt-4o-mini",
    "name": "GPT-4o Mini"
  },
  {
    "id": "llama-3.3-70b-instruct",
    "name": "Llama 3.3 70B"
  },
  {
    "id": "deepseek-chat",
    "name": "DeepSeek Chat"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
