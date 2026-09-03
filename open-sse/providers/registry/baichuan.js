export default {
  id: "baichuan",
  priority: 300,
  alias: "baichuan",
  
  display: {
    name: "Baichuan",
    color: "#EF4444",
    textIcon: "BA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.baichuan-ai.com/v1/chat/completions",
    validateUrl: "https://api.baichuan-ai.com/v1/models",
    
  },
  
  models: [
  {
    "id": "Baichuan4-Turbo",
    "name": "Baichuan 4 Turbo",
    "contextLength": 32768
  },
  {
    "id": "Baichuan4-Air",
    "name": "Baichuan 4 Air",
    "contextLength": 32768
  },
  {
    "id": "Baichuan4",
    "name": "Baichuan 4",
    "contextLength": 32768
  },
  {
    "id": "Baichuan3-Turbo",
    "name": "Baichuan 3 Turbo",
    "contextLength": 32768
  },
  {
    "id": "Baichuan3-Turbo-128k",
    "name": "Baichuan 3 Turbo 128k",
    "contextLength": 131072
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
