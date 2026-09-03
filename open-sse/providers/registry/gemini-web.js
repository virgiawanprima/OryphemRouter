export default {
  id: "gemini-web",
  alias: "gweb",
  display: {
    name: "Gemini Web",
    icon: "chat",
    color: "#4285F4",
    textIcon: "GW",
    website: "https://gemini.google.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "gemini-web",
    baseUrl: "https://gemini.google.com/app",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      toolCalling: false,
      supportsReasoning: false,
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      toolCalling: false,
      supportsReasoning: false,
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash-Lite",
      toolCalling: false,
      supportsReasoning: false,
    },
  ],
};
