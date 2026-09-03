export default {
  id: "electronhub",
  alias: "electronhub",
  display: {
    name: "ElectronHub",
    icon: "bolt",
    color: "#64748B",
    textIcon: "EH",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.electronhub.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.electronhub.ai/v1/models",
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
