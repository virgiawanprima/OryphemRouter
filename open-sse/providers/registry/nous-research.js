export default {
  id: "nous-research",
  priority: 300,
  alias: "nous",
  
  display: {
    name: "Nous Research",
    color: "#8B5CF6",
    textIcon: "NO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
    validateUrl: "https://inference-api.nousresearch.com/v1/models",
    
  },
  
  models: [
  {
    "id": "Hermes-4-405B",
    "name": "Hermes 4 7B (Nous Research)"
  },
  {
    "id": "Hermes-4-70B",
    "name": "Hermes 4 70B (Nous Research)"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
