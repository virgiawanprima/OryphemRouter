export default {
  id: "meta-llama",
  priority: 300,
  alias: "meta",
  
  display: {
    name: "Meta Llama",
    color: "#0866FF",
    textIcon: "ME",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.llama.com/compat/v1/chat/completions",
    validateUrl: "https://api.llama.com/compat/v1/models",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
