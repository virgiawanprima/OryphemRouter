export default {
  id: "tabitoken",
  priority: 300,
  alias: "tabitoken",
  
  display: {
    name: "tabitoken",
    color: "#64748B",
    textIcon: "TA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://tabitoken.com/v1/messages",
    validateUrl: "https://tabitoken.com/v1/models",

  },
  passthroughModels: true,

  models: [
  {
    "id": "claude-opus-5",
    "name": "Claude Opus 5"
  },
  {
    "id": "claude-opus-5-thinking",
    "name": "Claude Opus 5 (Thinking)"
  },
  {
    "id": "claude-opus-4-8",
    "name": "Claude Opus 4.8"
  },
  {
    "id": "claude-opus-4-8-thinking",
    "name": "Claude Opus 4.8 (Thinking)"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
