export default {
  id: "dit",
  priority: 300,
  alias: "dai",
  
  display: {
    name: "DIT",
    color: "#3B82F6",
    textIcon: "DI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.dit.ai/v1/chat/completions",
    validateUrl: "https://api.dit.ai/v1/models",

  },
  
  models: [
  {
    "id": "gpt-5.4",
    "name": "GPT-5.4 (DIT.ai)",
    "contextLength": 400000
  },
  {
    "id": "claude-sonnet-4-6",
    "name": "Claude Sonnet 4.6 (DIT.ai)",
    "contextLength": 200000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
