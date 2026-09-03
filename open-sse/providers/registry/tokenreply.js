export default {
  id: "tokenreply",
  alias: "tokenreply",
  display: {
    name: "TokenReply",
    icon: "reply",
    color: "#7C3AED",
    textIcon: "TR",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.tokenreply.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.tokenreply.com/v1/models",
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
