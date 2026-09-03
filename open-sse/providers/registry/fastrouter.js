export default {
  id: "fastrouter",
  alias: "fastrouter",
  display: {
    name: "FastRouter",
    icon: "rocket_launch",
    color: "#059669",
    textIcon: "FR",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.fastrouter.ai/api/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.fastrouter.ai/api/v1/models",
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
