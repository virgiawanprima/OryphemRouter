export default {
  id: "qwen-cloud-token-plan",
  priority: 300,
  alias: "qct",
  
  display: {
    name: "qwen-cloud-token-plan",
    color: "#64748B",
    textIcon: "QW",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    validateUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
    
  },
  
  models: [
  {
    "id": "qwen3.8-max",
    "name": "Qwen3.8 Max",
    "contextLength": 1
  },
  {
    "id": "qwen3.7-max",
    "name": "Qwen3.7 Max",
    "contextLength": 1
  },
  {
    "id": "qwen3.7-plus",
    "name": "Qwen3.7 Plus",
    "contextLength": 1
  },
  {
    "id": "qwen3.6-flash",
    "name": "Qwen3.6 Flash",
    "contextLength": 1
  },
  {
    "id": "glm-5.2",
    "name": "GLM 5.2",
    "contextLength": 1
  },
  {
    "id": "deepseek-v4-pro",
    "name": "DeepSeek V4 Pro",
    "contextLength": 1
  },
  {
    "id": "deepseek-v4-flash-0731",
    "name": "DeepSeek V4 Flash",
    "contextLength": 1
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
