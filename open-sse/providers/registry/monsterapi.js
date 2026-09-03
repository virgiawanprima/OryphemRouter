export default {
  id: "monsterapi",
  priority: 300,
  alias: "monster",
  
  display: {
    name: "MonsterAPI",
    color: "#F43F5E",
    textIcon: "MO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.monsterapi.ai/v1/chat/completions",
    validateUrl: "https://api.monsterapi.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "name": "Llama 3.1 8B Instruct"
  },
  {
    "id": "meta-llama/Llama-3.3-70B-Instruct",
    "name": "Llama 3.3 70B Instruct"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
