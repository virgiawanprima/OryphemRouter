export default {
  id: "free-ai",
  alias: "free-ai",
  display: {
    name: "Free AI",
    icon: "volunteer_activism",
    color: "#16A34A",
    textIcon: "FA",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.free.ai/v1/chat/",
    modelsFetcher: {
      url: "https://api.free.ai/v1/models",
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
