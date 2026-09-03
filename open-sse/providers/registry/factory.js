export default {
  id: "factory",
  priority: 300,
  alias: "factory",
  
  display: {
    name: "Factory",
    color: "#F97316",
    textIcon: "FA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.factory.ai/v1/chat/completions",
    validateUrl: "https://api.factory.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "auto",
    "name": "Factory Auto (best model)"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
