export default {
  id: "longcat",
  priority: 300,
  alias: "lc",
  
  display: {
    name: "LongCat",
    color: "#EC4899",
    textIcon: "LO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.longcat.chat/openai/v1/chat/completions",
    validateUrl: "https://api.longcat.chat/openai/v1/models",
    
  },
  
  models: [
  {
    "id": "LongCat-2.0",
    "name": "LongCat 2.0 (10M tok free 🆓)",
    "contextLength": 1048576
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
