export default {
  id: "llmgateway",
  alias: "llmgateway",
  display: {
    name: "LLMGateway",
    icon: "gate",
    color: "#0284C7",
    textIcon: "LGW",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.llmgateway.io/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.llmgateway.io/v1/models",
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
