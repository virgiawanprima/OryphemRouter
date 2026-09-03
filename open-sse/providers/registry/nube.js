export default {
  id: "nube",
  priority: 300,
  alias: "nube",
  
  display: {
    name: "Nube",
    color: "#22C55E",
    textIcon: "NU",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://ai.nube.sh/api/v1/chat/completions",
    validateUrl: "https://ai.nube.sh/api/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
