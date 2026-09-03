export default {
  id: "poe",
  priority: 300,
  alias: "poe",
  
  display: {
    name: "poe",
    color: "#64748B",
    textIcon: "PO",
  },
  category: "apikey",
  transport: {
    baseUrl: null,
    
  },
  passthroughModels: true,

  models: [
  {
    "id": "gpt-5.2",
    "name": "GPT-5.2"
  },
  {
    "id": "claude-opus-4.8",
    "name": "Claude Opus 4.8"
  },
  {
    "id": "gemini-3.0-pro",
    "name": "Gemini 3.0 Pro"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
