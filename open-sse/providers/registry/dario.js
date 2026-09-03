export default {
  id: "dario",
  alias: "dario",
  display: {
    name: "Dario",
    icon: "terminal",
    color: "#B45309",
    textIcon: "DR",
    website: "https://dario.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "dario",
    baseUrl: "http://127.0.0.1:3456/v1/chat/completions",
    validateUrl: "http://127.0.0.1:3456/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
