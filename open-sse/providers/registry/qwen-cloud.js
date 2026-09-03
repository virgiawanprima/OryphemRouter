export default {
  id: "qwen-cloud",
  priority: 300,
  alias: "qwc",
  
  display: {
    name: "Qwen Cloud",
    color: "#64748B",
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
