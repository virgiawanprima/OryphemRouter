export default {
  id: "doubao-web",
  alias: "db",
  display: {
    name: "Doubao Web",
    icon: "web",
    color: "#3370FF",
    textIcon: "DB",
    website: "https://www.doubao.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "doubao-web",
    baseUrl: "https://www.dola.com/chat/completion",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "dola-speed",
      name: "Dola Speed",
      toolCalling: false,
    },
    {
      id: "dola-pro",
      name: "Dola Pro",
      toolCalling: false,
    },
  ],
};
