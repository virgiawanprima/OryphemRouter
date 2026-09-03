export default {
  id: "ninerouter",
  alias: "9r",
  display: {
    name: "NineRouter",
    icon: "hub",
    color: "#0891B2",
    textIcon: "9R",
    website: "https://9router.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "ninerouter",
    baseUrl: "http://127.0.0.1:20130/v1/chat/completions",
    validateUrl: "http://127.0.0.1:20130/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
