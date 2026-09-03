export default {
  id: "logfare",
  alias: "logfare",
  display: {
    name: "LogFare",
    icon: "receipt_long",
    color: "#0F766E",
    textIcon: "LF",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://logfare.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://logfare.ai/v1/models",
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
