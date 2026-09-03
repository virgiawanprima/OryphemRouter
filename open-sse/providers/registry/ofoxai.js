export default {
  id: "ofoxai",
  alias: "ofoxai",
  display: {
    name: "OFox AI",
    icon: "bolt",
    color: "#F97316",
    textIcon: "OF",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.ofox.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.ofox.ai/v1/models",
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
