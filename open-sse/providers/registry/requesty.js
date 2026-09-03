export default {
  id: "requesty",
  alias: "requesty",
  display: {
    name: "Requesty",
    icon: "swap_horiz",
    color: "#0EA5E9",
    textIcon: "RQ",
    website: "https://requesty.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://router.requesty.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://router.requesty.ai/v1/models",
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
