export default {
  id: "inception",
  priority: 300,
  alias: "inception",
  
  display: {
    name: "Inception",
    color: "#6366F1",
    textIcon: "IN",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.inceptionlabs.ai/v1/chat/completions",
    validateUrl: "https://api.inceptionlabs.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "mercury-2",
    "name": "Mercury 2",
    "contextLength": 128000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
