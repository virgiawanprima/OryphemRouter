export default {
  id: "modelscope",
  priority: 300,
  alias: "ms",
  
  display: {
    name: "ModelScope",
    color: "#FF6600",
    textIcon: "MO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api-inference.modelscope.cn/v1/chat/completions",
    validateUrl: "https://api-inference.modelscope.cn/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
