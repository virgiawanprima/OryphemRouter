export default {
  id: "alibaba",
  priority: 300,
  alias: "ali",
  
  display: {
    name: "Alibaba",
    color: "#FF6A00",
    textIcon: "QW",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    validateUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
