export default {
  id: "plamo",
  priority: 300,
  alias: "plamo",
  
  display: {
    name: "plamo",
    color: "#64748B",
    textIcon: "PL",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.platform.preferredai.jp/v1/chat/completions",
    validateUrl: "https://api.platform.preferredai.jp/v1/models",
    
  },
  
  models: [
  {
    "id": "plamo-3.0-prime",
    "name": "PLaMo 3.0 Prime",
    "contextLength": 262144
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
