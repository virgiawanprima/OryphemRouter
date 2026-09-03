export default {
  id: "oneminai",
  priority: 300,
  alias: "1min",
  
  display: {
    name: "OneMinAI",
    color: "#F97316",
    textIcon: "ON",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.1min.ai/api/chat-with-ai",
    
  },
  passthroughModels: true,

  models: [
  {
    "id": "gpt-4o-mini",
    "name": "GPT-4o Mini"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
