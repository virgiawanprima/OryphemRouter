export default {
  id: "uncloseai",
  alias: "unc",
  display: {
    name: "UncloseAI",
    icon: "bolt",
    color: "#0EA5E9",
    textIcon: "UA",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://hermes.ai.unturf.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://hermes.ai.unturf.com/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "adamo1139/Hermes-3-Llama-3.1-8B-FP8-Dynamic",
      name: "Hermes 3 Llama 3.1 8B (🆓 Free)",
    },
    {
      id: "qwen3.6:27b",
      name: "Qwen3 Coder 27B (🆓 Free)",
    },
    {
      id: "gemma4:31b",
      name: "Gemma 4 31B (🆓 Free)",
    },
  ],
};
