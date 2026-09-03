export default {
  id: "unorouter",
  alias: "unorouter",
  display: {
    name: "Unorouter",
    icon: "router",
    color: "#E11D48",
    textIcon: "UR",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.unorouter.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.unorouter.com/v1/models",
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
