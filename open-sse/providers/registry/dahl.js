export default {
  id: "dahl",
  alias: "dahl",
  display: {
    name: "Dahl",
    icon: "nature",
    color: "#0F766E",
    textIcon: "DH",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "openai-compatible",
    baseUrl: "https://inference.dahl.global/v1/chat/completions",
    validateUrl: "https://inference.dahl.global/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "MiniMaxAI/MiniMax-M2.7",
      name: "MiniMax M2.7",
      contextLength: 200000,
    },
    {
      id: "moonshotai/Kimi-K2.6",
      name: "Kimi K2.6",
      contextLength: 200000,
    },
  ],
};
