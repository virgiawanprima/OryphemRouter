export default {
  id: "sensenova",
  priority: 300,
  alias: "sensenova",
  
  display: {
    name: "sensenova",
    color: "#64748B",
    textIcon: "SE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://token.sensenova.cn/v1/chat/completions",
    validateUrl: "https://token.sensenova.cn/v1/models",
    
  },
  
  models: [
  {
    "id": "sensenova-6.7-flash-lite",
    "name": "SenseNova 6.7 Flash-Lite",
    "contextLength": 262144
  },
  {
    "id": "deepseek-v4-flash",
    "name": "DeepSeek V4 Flash",
    "contextLength": 1048576
  },
  {
    "id": "glm-5.2",
    "name": "GLM 5.2",
    "contextLength": 1048576
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
