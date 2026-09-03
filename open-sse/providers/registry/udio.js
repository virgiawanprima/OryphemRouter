export default {
  id: "udio",
  priority: 300,
  alias: "udio",
  
  display: {
    name: "udio",
    color: "#64748B",
    textIcon: "UD",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://www.udio.com/api/generate-proxy",
    
  },
  
  models: [
  {
    "id": "udio-default",
    "name": "Udio Default"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
