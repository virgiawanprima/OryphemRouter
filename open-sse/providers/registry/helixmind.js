export default {
  id: "helixmind",
  alias: "helixmind",
  display: {
    name: "HelixMind",
    icon: "psychology",
    color: "#0EA5E9",
    textIcon: "HM",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://helixmind.online/v1/chat/completions",
    responsesUrl: "https://helixmind.online/v1/responses",
    modelsFetcher: {
      url: "https://helixmind.online/v1/models",
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
