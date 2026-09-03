export default {
  id: "nlpcloud",
  priority: 300,
  alias: "nlpc",
  
  display: {
    name: "NLP Cloud",
    color: "#3B82F6",
    textIcon: "NL",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.nlpcloud.io/v1/chat/completions",
    validateUrl: "https://api.nlpcloud.io/v1/models",
    
  },
  
  models: [
  {
    "id": "chatdolphin",
    "name": "ChatDolphin",
    "contextLength": 8192
  },
  {
    "id": "dolphin",
    "name": "Dolphin",
    "contextLength": 16384
  },
  {
    "id": "finetuned-llama-3-70b",
    "name": "Fine-tuned LLaMA 3.3 70B"
  },
  {
    "id": "llama-3-1-405b",
    "name": "LLaMA 3.1 405B"
  },
  {
    "id": "llama-3-8b-instruct",
    "name": "Llama 3 8B"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
