export default {
  id: "void-ai",
  alias: "void-ai",
  display: {
    name: "Void AI",
    icon: "circle",
    color: "#111827",
    textIcon: "VD",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.voidai.app/v1/chat/completions",
    responsesUrl: "https://api.voidai.app/v1/responses",
    modelsFetcher: {
      url: "https://api.voidai.app/v1/models",
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
