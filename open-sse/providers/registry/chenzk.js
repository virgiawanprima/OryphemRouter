export default {
  id: "chenzk",
  priority: 300,
  alias: "chenzk",
  
  display: {
    name: "ChenZK",
    color: "#F59E0B",
    textIcon: "CH",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://chenzk.top/v1/chat/completions",
    validateUrl: "https://chenzk.top/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
