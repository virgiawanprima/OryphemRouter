export default {
  id: "ideogram",
  priority: 300,
  alias: "ideo",
  
  display: {
    name: "Ideogram",
    color: "#F43F5E",
    textIcon: "ID",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.ideogram.ai",
    
  },
  
  models: [
  {
    "id": "V_3",
    "name": "Ideogram V3"
  },
  {
    "id": "V_2A",
    "name": "Ideogram V2A"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
