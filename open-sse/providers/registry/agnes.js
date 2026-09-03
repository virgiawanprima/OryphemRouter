export default {
  id: "agnes",
  priority: 300,
  alias: "agnes",
  
  display: {
    name: "AI-agnostic gateway",
    color: "#6B5B95",
    textIcon: "AG",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://apihub.agnes-ai.com/v1/chat/completions",
    validateUrl: "https://apihub.agnes-ai.com/v1/models",
    
  },
  
  models: [
  {
    "id": "agnes-1.5-flash",
    "name": "Agnes 1.5 Flash",
    "contextLength": 262144
  },
  {
    "id": "agnes-2.0-flash",
    "name": "Agnes 2.0 Flash",
    "contextLength": 262144
  },
  {
    "id": "agnes-2.5-flash",
    "name": "Agnes 2.5 Flash",
    "contextLength": 524288
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
