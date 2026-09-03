export default {
  id: "meganova-ai",
  alias: "meganova-ai",
  display: {
    name: "MegaNova AI",
    icon: "auto_awesome",
    color: "#D946EF",
    textIcon: "MN",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.meganova.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.meganova.ai/v1/models",
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
