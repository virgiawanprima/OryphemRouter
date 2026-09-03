export default {
  id: "helyxai",
  alias: "helyxai",
  display: {
    name: "Helyx AI",
    icon: "auto_awesome",
    color: "#8B5CF6",
    textIcon: "HX",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://helyxai.space/v1/chat/completions",
    modelsFetcher: {
      url: "https://helyxai.space/v1/models",
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
