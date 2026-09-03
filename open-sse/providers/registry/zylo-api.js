export default {
  id: "zylo-api",
  alias: "zylo",
  display: {
    name: "Zylo API",
    icon: "api",
    color: "#8B5CF6",
    textIcon: "ZY",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.zyloai.net/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.zyloai.net/v1/models",
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
