export default {
  id: "kimi-web",
  alias: "kimi-web",
  display: {
    name: "Kimi Web",
    icon: "chat",
    color: "#22C55E",
    textIcon: "KW",
    website: "https://kimi.moonshot.cn",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "kimi-web",
    baseUrl: "https://www.kimi.ai",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "k3",
      name: "K3",
      supportsReasoning: true,
      toolCalling: false,
    },
    {
      id: "k2d6",
      name: "K2.6",
      supportsReasoning: true,
      toolCalling: false,
    },
  ],
};
