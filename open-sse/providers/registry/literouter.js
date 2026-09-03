export default {
  id: "literouter",
  alias: "literouter",
  display: {
    name: "LiteRouter",
    icon: "router",
    color: "#0891B2",
    textIcon: "LR",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.literouter.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.literouter.com/v1/models",
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
