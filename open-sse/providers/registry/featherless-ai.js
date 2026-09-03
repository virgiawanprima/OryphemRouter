export default {
  id: "featherless-ai",
  priority: 300,
  alias: "fai",
  
  display: {
    name: "Featherless AI",
    color: "#84CC16",
    textIcon: "FE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.featherless.ai/v1/chat/completions",
    validateUrl: "https://api.featherless.ai/v1/models",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
