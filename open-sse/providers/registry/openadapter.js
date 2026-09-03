export default {
  id: "openadapter",
  priority: 300,
  alias: "oad",
  
  display: {
    name: "OpenAdapter",
    color: "#6366F1",
    textIcon: "OP",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.openadapter.in/v1/chat/completions",
    validateUrl: "https://api.openadapter.in/v1/models",

  },
  
  models: [
  {
    "id": "glm-4.7",
    "name": "GLM 4.7 (OpenAdapter)",
    "contextLength": 128000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
