export default {
  id: "regolo",
  priority: 300,
  alias: "regolo",
  
  display: {
    name: "regolo",
    color: "#64748B",
    textIcon: "RE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.regolo.ai",
    
  },
  passthroughModels: true,

  models: [
  {
    "id": "regolo-chat",
    "name": "Regolo Chat"
  },
  {
    "id": "regolo-fast",
    "name": "Regolo Fast"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
