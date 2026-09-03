export default {
  id: "reka",
  priority: 300,
  alias: "reka",
  
  display: {
    name: "reka",
    color: "#64748B",
    textIcon: "RE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.reka.ai/v1/chat/completions",
    validateUrl: "https://api.reka.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "reka-flash-3",
    "name": "Reka Flash 3"
  },
  {
    "id": "reka-flash",
    "name": "Reka Flash"
  },
  {
    "id": "reka-edge-2603",
    "name": "Reka Edge 2603"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
