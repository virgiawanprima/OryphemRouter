export default {
  id: "qiniu",
  priority: 300,
  alias: "qiniu",
  
  display: {
    name: "qiniu",
    color: "#64748B",
    textIcon: "QI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.qnaigc.com/v1/chat/completions",
    validateUrl: "https://api.qnaigc.com/v1/models",

  },
  passthroughModels: true,

  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
