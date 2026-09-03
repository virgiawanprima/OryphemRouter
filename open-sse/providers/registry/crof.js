export default {
  id: "crof",
  priority: 300,
  alias: "crof",
  
  display: {
    name: "Crof",
    color: "#EC4899",
    textIcon: "CR",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://crof.ai/v1/chat/completions",
    validateUrl: "https://crof.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "deepseek-v4-pro",
    "name": "DeepSeek V4 Pro"
  },
  {
    "id": "deepseek-v4-flash",
    "name": "DeepSeek V4 Flash"
  },
  {
    "id": "deepseek-v4-flash-0731",
    "name": "DeepSeek V4 Flash 0731"
  },
  {
    "id": "deepseek-v3.2",
    "name": "DeepSeek V3.2"
  },
  {
    "id": "kimi-k2.6",
    "name": "Kimi K2.6"
  },
  {
    "id": "kimi-k2.7-code",
    "name": "Kimi K2.7 Code"
  },
  {
    "id": "kimi-k3",
    "name": "Kimi K3"
  },
  {
    "id": "kimi-k3-eco",
    "name": "Kimi K3 Eco"
  },
  {
    "id": "glm-5.1",
    "name": "GLM 5.1"
  },
  {
    "id": "glm-5.2",
    "name": "GLM 5.2"
  },
  {
    "id": "mimo-v2.5-pro",
    "name": "Mimo 2.5 Pro"
  },
  {
    "id": "gemma-4-31b-it",
    "name": "Gemma 4 31B"
  },
  {
    "id": "qwen3.6-27b",
    "name": "Qwen3.6 27B"
  },
  {
    "id": "qwen3.5-397b-a17b",
    "name": "Qwen3.5 397B A17B"
  },
  {
    "id": "qwen3.5-9b",
    "name": "Qwen3.5 9B"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
