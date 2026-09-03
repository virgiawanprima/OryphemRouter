export default {
  id: "anyapi",
  alias: "anyapi",
  display: {
    name: "AnyAPI",
    icon: "hub",
    color: "#0EA5E9",
    textIcon: "AA",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.anyapi.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.anyapi.ai/v1/models",
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
