export default {
  id: "coze",
  priority: 300,
  alias: "coze",
  
  display: {
    name: "Coze",
    color: "#6366F1",
    textIcon: "CO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.coze.com/v1/chat/completions",
    validateUrl: "https://api.coze.com/v1/models",
    
  },
  
  models: [
  {
    "id": "claude-3-7-sonnet-20250514",
    "name": "Claude 3.7 Sonnet"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
