export default {
  id: "typhoon",
  priority: 300,
  alias: "typhoon",
  
  display: {
    name: "typhoon",
    color: "#64748B",
    textIcon: "TY",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.opentyphoon.ai/v1/chat/completions",
    validateUrl: "https://api.opentyphoon.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "typhoon-v2.5-30b-a3b-instruct",
    "name": "Typhoon v2.5 30B A3B Instruct",
    "contextLength": 131072
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
