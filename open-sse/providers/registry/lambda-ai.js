export default {
  id: "lambda-ai",
  priority: 300,
  alias: "lambda",
  
  display: {
    name: "Lambda AI",
    color: "#EF4444",
    textIcon: "LA",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.lambda.ai/v1/chat/completions",
    validateUrl: "https://api.lambda.ai/v1/models",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
