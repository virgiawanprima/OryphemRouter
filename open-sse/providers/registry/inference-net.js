export default {
  id: "inference-net",
  priority: 300,
  alias: "inet",
  
  display: {
    name: "Inference.net",
    color: "#22D3EE",
    textIcon: "IN",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.inference.net/v1/chat/completions",
    validateUrl: "https://api.inference.net/v1/models",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
