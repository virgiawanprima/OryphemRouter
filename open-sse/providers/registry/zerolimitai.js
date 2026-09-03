export default {
  id: "zerolimitai",
  alias: "zerolimitai",
  display: {
    name: "ZeroLimit AI",
    icon: "all_inclusive",
    color: "#DC2626",
    textIcon: "ZL",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://www.zerolimitai.com/api/v1/chat/completions",
    modelsFetcher: {
      url: "https://www.zerolimitai.com/api/v1/models",
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
