export default {
  id: "kenari",
  priority: 300,
  alias: "kenari",
  
  display: {
    name: "Kenari",
    color: "#F59E0B",
    textIcon: "KE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://kenari.id/v1/chat/completions",
    validateUrl: "https://kenari.id/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
