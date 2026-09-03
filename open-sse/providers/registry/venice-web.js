export default {
  id: "venice-web",
  alias: "ven-web",
  display: {
    name: "Venice Web",
    icon: "shield",
    color: "#DC2626",
    textIcon: "VW",
    website: "https://venice.ai",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "venice-web",
    baseUrl: "https://venice.ai",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "venice-default",
      name: "Venice Default",
    },
  ],
  passthroughModels: true,
};
