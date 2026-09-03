export default {
  id: "nanogpt",
  alias: "nanogpt",
  display: {
    name: "NanoGPT",
    icon: "memory",
    color: "#10B981",
    textIcon: "NG",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://nano-gpt.com/api/v1/chat/completions",
    responsesUrl: "https://nano-gpt.com/api/v1/responses",
    modelsFetcher: {
      url: "https://nano-gpt.com/api/v1/models",
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
      id: "chatgpt-4o-latest",
      name: "chatgpt-4o-latest",
    },
    {
      id: "claude-3.5-sonnet",
      name: "claude-3.5-sonnet",
    },
    {
      id: "gpt-4o-mini",
      name: "gpt-4o-mini",
    },
  ],
};
