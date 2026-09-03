export default {
  id: "charm-hyper",
  priority: 300,
  alias: "charm-hyper",
  
  display: {
    name: "Charm Hyper",
    color: "#F43F5E",
    textIcon: "CH",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://hyper.charm.land/v1/chat/completions",
    validateUrl: "https://hyper.charm.land/v1/models",

  },
  passthroughModels: true,

  models: [
  {
    "id": "hyper/auto",
    "name": "Charm Hyper Auto"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
