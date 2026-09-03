export default {
  id: "dgrid",
  priority: 300,
  alias: "dgrid",
  
  display: {
    name: "DGrid",
    color: "#14B8A6",
    textIcon: "DG",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.dgrid.ai/v1/chat/completions",
    validateUrl: "https://api.dgrid.ai/v1/models",

  },
  passthroughModels: true,

  models: [
  {
    "id": "dgridai/free",
    "name": "DGrid Free Models Router"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
