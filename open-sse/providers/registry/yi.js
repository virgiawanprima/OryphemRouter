export default {
  id: "yi",
  priority: 300,
  alias: "yi",
  
  display: {
    name: "yi",
    color: "#64748B",
    textIcon: "YI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.lingyiwanwu.com/v1/chat/completions",
    validateUrl: "https://api.lingyiwanwu.com/v1/models",
    
  },
  
  models: [
  {
    "id": "yi-large",
    "name": "Yi Large"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
