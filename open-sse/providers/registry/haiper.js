export default {
  id: "haiper",
  priority: 300,
  alias: "hp",
  
  display: {
    name: "Haip",
    color: "#EC4899",
    textIcon: "HA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.haiper.ai/v1",
    
  },
  
  models: [
  {
    "id": "gen2",
    "name": "Gen 2 Video"
  },
  {
    "id": "gen2-image",
    "name": "Gen 2 Image"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
