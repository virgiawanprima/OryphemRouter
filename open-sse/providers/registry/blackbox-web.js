export default {
  id: "blackbox-web",
  alias: "bb-web",
  display: {
    name: "Blackbox Web",
    icon: "web",
    color: "#111827",
    textIcon: "BB",
    website: "https://www.blackbox.ai",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "blackbox-web",
    baseUrl: "https://app.blackbox.ai/api/chat",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      toolCalling: false,
    },
    {
      id: "gpt-4",
      name: "GPT-4",
      toolCalling: false,
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      toolCalling: false,
    },
    {
      id: "claude-3-opus",
      name: "Claude 3 Opus",
      toolCalling: false,
    },
    {
      id: "claude-3-sonnet",
      name: "Claude 3 Sonnet",
      toolCalling: false,
    },
    {
      id: "gemini-pro",
      name: "Gemini Pro",
      toolCalling: false,
    },
  ],
};
