export default {
  id: "agentrouter",
  priority: 300,
  alias: "agentrouter",
  
  display: {
    name: "agentrouter",
    color: "#64748B",
    textIcon: "AG",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://agentrouter.org/v1/messages",
    validateUrl: "https://agentrouter.org/models",
    
  },
  passthroughModels: true,

  models: [
  {
    "id": "claude-opus-4-8",
    "name": "Claude Opus 4.8"
  },
  {
    "id": "claude-opus-5",
    "name": "Claude Opus 5"
  },
  {
    "id": "gpt-5.6-sol",
    "name": "GPT-5.6 Sol"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
