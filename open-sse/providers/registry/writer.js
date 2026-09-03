export default {
  id: "writer",
  priority: 300,
  alias: "writer",
  
  display: {
    name: "writer",
    color: "#64748B",
    textIcon: "WR",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.writer.com/v1/chat/completions",
    validateUrl: "https://api.writer.com/v1/models",
    
  },
  
  models: [
  {
    "id": "palmyra-x5",
    "name": "Palmyra X5",
    "contextLength": 1048576
  },
  {
    "id": "palmyra-x4",
    "name": "Palmyra X4",
    "contextLength": 131072
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
