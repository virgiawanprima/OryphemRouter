export default {
  id: "leonardo",
  priority: 300,
  alias: "leo",
  
  display: {
    name: "Leonardo",
    color: "#8B5CF6",
    textIcon: "LE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://cloud.leonardo.ai/api/rest/v1",
    
  },
  
  models: [
  {
    "id": "phoenix",
    "name": "Phoenix"
  },
  {
    "id": "sdxl",
    "name": "SDXL"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
