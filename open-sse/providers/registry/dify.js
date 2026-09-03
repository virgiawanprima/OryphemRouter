export default {
  id: "dify",
  priority: 300,
  alias: "dify",
  
  display: {
    name: "Dify",
    color: "#8B5CF6",
    textIcon: "DI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.dify.ai",
    
  },
  
  models: [
  {
    "id": "auto",
    "name": "Auto"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
