export default {
  id: "auriko",
  alias: "auriko",
  display: {
    name: "Auriko",
    icon: "star",
    color: "#D946EF",
    textIcon: "AU",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.auriko.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.auriko.ai/v1/models",
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
