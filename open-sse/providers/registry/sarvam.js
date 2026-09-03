export default {
  id: "sarvam",
  priority: 300,
  alias: "sarvam",
  
  display: {
    name: "sarvam",
    color: "#64748B",
    textIcon: "SA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.sarvam.ai/v1/chat/completions",
    validateUrl: "https://api.sarvam.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "sarvam-105b",
    "name": "Sarvam 105B",
    "contextLength": 131072
  },
  {
    "id": "sarvam-30b",
    "name": "Sarvam 30B",
    "contextLength": 65536
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
