export default {
  id: "poixe-ai",
  alias: "poixe-ai",
  display: {
    name: "Poixe AI",
    icon: "auto_awesome",
    color: "#BE185D",
    textIcon: "PX",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.poixe.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.poixe.com/v1/models",
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
