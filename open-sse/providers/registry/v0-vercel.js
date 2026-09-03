export default {
  id: "v0-vercel",
  priority: 300,
  alias: "v0",
  
  display: {
    name: "v0-vercel",
    color: "#64748B",
    textIcon: "V0",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.v0.dev/v1/chat/completions",
    validateUrl: "https://api.v0.dev/v1/models",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
