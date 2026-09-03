export default {
  id: "llm-kiwi",
  alias: "llmkiwi",
  display: {
    name: "LLM Kiwi",
    icon: "eco",
    color: "#65A30D",
    textIcon: "LK",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.llm.kiwi/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.llm.kiwi/v1/models",
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
      id: "auto",
      name: "Auto",
    },
    {
      id: "hrLLM",
      name: "hrLLM",
    },
  ],
  passthroughModels: true,
};
