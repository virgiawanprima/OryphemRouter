export default {
  id: "ant-ling",
  priority: 300,
  alias: "ling",
  
  display: {
    name: "Ant Ling",
    color: "#8B5CF6",
    textIcon: "AN",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.ant-ling.com/v1/chat/completions",
    validateUrl: "https://api.ant-ling.com/v1/models",
    
  },
  
  models: [
  {
    "id": "Ling-2.6-1T",
    "name": "Ling 2.6 1T"
  },
  {
    "id": "Ring-2.6-1T",
    "name": "Ring 2.6 1T"
  },
  {
    "id": "Ling-2.6-flash",
    "name": "Ling 2.6 Flash"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
