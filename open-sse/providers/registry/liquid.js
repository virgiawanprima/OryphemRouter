export default {
  id: "liquid",
  priority: 300,
  alias: "liquid",
  
  display: {
    name: "Liquid AI",
    color: "#22C55E",
    textIcon: "LI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://inference.liquid.ai/v1/chat/completions",
    validateUrl: "https://inference.liquid.ai/v1/models",

  },
  
  models: [
  {
    "id": "liquid-lfm-40b",
    "name": "Liquid LFM 40B"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
