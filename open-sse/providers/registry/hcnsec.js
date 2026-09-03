export default {
  id: "hcnsec",
  alias: "hcnsec",
  display: {
    name: "HCN SEC",
    icon: "security",
    color: "#0F172A",
    textIcon: "HS",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.hcnsec.cn/v1/chat/completions",
    responsesUrl: "https://api.hcnsec.cn/v1/responses",
    modelsFetcher: {
      url: "https://api.hcnsec.cn/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
