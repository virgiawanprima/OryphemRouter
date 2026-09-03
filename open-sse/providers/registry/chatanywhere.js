export default {
  id: "chatanywhere",
  alias: "chatanywhere",
  display: {
    name: "ChatAnywhere",
    icon: "forum",
    color: "#14B8A6",
    textIcon: "CA",
    website: "https://chatanywhere.tech",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.chatanywhere.org/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.chatanywhere.org/v1/models",
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
