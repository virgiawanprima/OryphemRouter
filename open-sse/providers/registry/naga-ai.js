export default {
  id: "naga-ai",
  alias: "naga-ai",
  display: {
    name: "Naga AI",
    icon: "bolt",
    color: "#EF4444",
    textIcon: "NA",
    website: "https://naga.ac",
  },
  category: "apikey",
  authType: "apikey",
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
