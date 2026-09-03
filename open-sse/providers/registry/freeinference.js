export default {
  id: "freeinference",
  alias: "freeinference",
  display: {
    name: "FreeInference",
    icon: "bolt",
    color: "#22C55E",
    textIcon: "FI",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://freeinference.org/v1/chat/completions",
    modelsFetcher: {
      url: "https://freeinference.org/v1/models",
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
