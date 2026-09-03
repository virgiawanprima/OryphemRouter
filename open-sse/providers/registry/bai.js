export default {
  id: "bai",
  priority: 300,
  alias: "bai",
  
  display: {
    name: "Bai",
    color: "#10B981",
    textIcon: "BA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.b.ai/v1/chat/completions",
    validateUrl: "https://api.b.ai/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
