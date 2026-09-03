export default {
  id: "modal",
  priority: 300,
  alias: "modal",
  
  display: {
    name: "Modal",
    color: "#7C3AED",
    textIcon: "MO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.modal.ai/v1/chat/completions",
    validateUrl: "https://api.modal.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "google/gemini-2.0-flash",
    "name": "Gemini 2.0 Flash"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
