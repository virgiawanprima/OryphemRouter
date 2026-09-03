export default {
  id: "felo-web",
  alias: "felo",
  display: {
    name: "Felo Web",
    icon: "search",
    color: "#2563EB",
    textIcon: "FL",
    website: "https://felo.ai",
  },
  category: "freeTier",
  authType: "none",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "felo-web",
    baseUrl: "https://felo.ai/api-proxy/main/search/threads",
  },
  models: [
    {
      id: "felo-chat",
      name: "Felo Chat",
      toolCalling: false,
    },
    {
      id: "felo-search",
      name: "Felo Search",
      toolCalling: false,
    },
    {
      id: "felo-scholar",
      name: "Felo Scholar",
      toolCalling: false,
    },
    {
      id: "felo-social",
      name: "Felo Social",
      toolCalling: false,
    },
    {
      id: "felo-document",
      name: "Felo Document",
      toolCalling: false,
    },
  ],
};
