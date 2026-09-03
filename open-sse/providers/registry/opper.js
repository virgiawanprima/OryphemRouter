export default {
  id: "opper",
  alias: "opper",
  display: {
    name: "Opper",
    icon: "bolt",
    color: "#111827",
    textIcon: "OP",
    website: "https://opper.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.opper.ai/v3/compat/chat/completions",
    modelsFetcher: {
      url: "https://api.opper.ai/v3/compat/models",
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
