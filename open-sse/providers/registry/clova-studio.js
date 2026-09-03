export default {
  id: "clova-studio",
  priority: 300,
  alias: "clova",
  
  display: {
    name: "Clova Studio",
    color: "#0D9488",
    textIcon: "CL",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://clovastudio.stream.ntruss.com/v1/openai/chat/completions",
    validateUrl: "https://clovastudio.stream.ntruss.com/v1/openai/models",
    
  },
  
  models: [
  {
    "id": "HCX-007",
    "name": "HCX-007"
  },
  {
    "id": "HCX-005",
    "name": "HCX-005"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
