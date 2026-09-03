export default {
  id: "x5lab",
  priority: 300,
  alias: "x5lab",
  
  display: {
    name: "x5lab",
    color: "#64748B",
    textIcon: "X5",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.x5lab.dev/v1/chat/completions",
    validateUrl: "https://api.x5lab.dev/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
