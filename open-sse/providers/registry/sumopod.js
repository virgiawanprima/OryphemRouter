export default {
  id: "sumopod",
  priority: 300,
  alias: "sumopod",
  
  display: {
    name: "sumopod",
    color: "#64748B",
    textIcon: "SU",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://ai.sumopod.com/v1/chat/completions",
    validateUrl: "https://ai.sumopod.com/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
