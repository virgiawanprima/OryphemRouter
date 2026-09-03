export default {
  id: "chat-oripe",
  alias: "chat-oripe",
  display: {
    name: "Chat Oripé",
    icon: "chat",
    color: "#F59E0B",
    textIcon: "CO",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.oriper.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.oriper.com/v1/models",
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
