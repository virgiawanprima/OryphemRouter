export default {
  id: "mnn-ai",
  alias: "mnn-ai",
  display: {
    name: "MNN AI",
    icon: "bolt",
    color: "#2563EB",
    textIcon: "MNN",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.mnnai.ru/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.mnnai.ru/v1/models",
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
