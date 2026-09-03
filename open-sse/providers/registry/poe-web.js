export default {
  id: "poe-web",
  alias: "poe-web",
  display: {
    name: "Poe Web",
    icon: "chat",
    color: "#7C3AED",
    textIcon: "PW",
    website: "https://www.poe.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "poe-web",
    baseUrl: "https://www.poe.com",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "poe-default",
      name: "Assistant",
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
    },
    {
      id: "gpt-4-turbo",
      name: "GPT-4-Turbo",
    },
    {
      id: "claude-3.5-sonnet",
      name: "Claude-3.5-Sonnet",
    },
    {
      id: "claude-3-opus",
      name: "Claude-3-Opus",
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini-2.0-Flash",
    },
    {
      id: "llama-3-70b",
      name: "Llama-3-70B",
    },
    {
      id: "mixtral-8x22b",
      name: "Mixtral-8x22B",
    },
  ],
};
