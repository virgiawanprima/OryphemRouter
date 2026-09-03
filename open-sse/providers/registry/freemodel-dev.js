export default {
  id: "freemodel-dev",
  priority: 300,
  alias: "fmd",
  
  display: {
    name: "FreeModel.dev",
    color: "#10B981",
    textIcon: "FR",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.freemodel.dev/v1/chat/completions",
    validateUrl: "https://api.freemodel.dev/v1/models",

  },
  
  models: [
  {
    "id": "gpt-5.5",
    "name": "GPT-5.5",
    "contextLength": 400000
  },
  {
    "id": "gpt-5.4",
    "name": "GPT-5.4",
    "contextLength": 400000
  },
  {
    "id": "gpt-5.4-mini",
    "name": "GPT-5.4 Mini"
  },
  {
    "id": "gpt-5.3-codex",
    "name": "GPT-5.3 Codex"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
