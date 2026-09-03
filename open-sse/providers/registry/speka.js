export default {
  id: "speka",
  alias: "speka",
  display: {
    name: "Speka",
    icon: "record_voice_over",
    color: "#6366F1",
    textIcon: "SP",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://speka.me/v1/chat/completions",
    modelsFetcher: {
      url: "https://speka.me/v1/models",
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
