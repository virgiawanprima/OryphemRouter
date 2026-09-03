export default {
  id: "naga-ac",
  alias: "naga",
  display: {
    name: "Naga AC",
    icon: "bolt",
    color: "#DC2626",
    textIcon: "NAC",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.naga.ac/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.naga.ac/v1/models",
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
