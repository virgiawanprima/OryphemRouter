export default {
  id: "copilot-web",
  alias: "copilot-web",
  display: {
    name: "Copilot Web",
    icon: "web",
    color: "#0078D4",
    textIcon: "CP",
    website: "https://copilot.microsoft.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "copilot-web",
    baseUrl: "wss://copilot.microsoft.com/c/api/chat?api-version=2",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "copilot-pro",
      name: "Copilot Pro (web)",
      toolCalling: false,
    },
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo (via Copilot)",
      toolCalling: false,
    },
    {
      id: "gpt-4",
      name: "GPT-4 (via Copilot)",
      toolCalling: false,
    },
  ],
};
