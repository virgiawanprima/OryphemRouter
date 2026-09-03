export default {
  id: "gemini-business",
  alias: "gbiz",
  display: {
    name: "Gemini Business",
    icon: "work",
    color: "#4285F4",
    textIcon: "GB",
    website: "https://business.gemini.google",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "gemini-business",
    baseUrl: "https://business.gemini.google",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-3-ultra",
      name: "Gemini 3 Ultra",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-3-flash",
      name: "Gemini 3 Flash",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-2.5-flash-thinking",
      name: "Gemini 2.5 Flash Thinking",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-2.0-pro",
      name: "Gemini 2.0 Pro",
      toolCalling: false,
    },
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      toolCalling: false,
    },
    {
      id: "gemini-2.0-flash-thinking",
      name: "Gemini 2.0 Flash Thinking",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "gemini-3-pro-image",
      name: "Gemini 3 Pro Image",
      kind: "image",
    },
    {
      id: "gemini-2.0-flash-image",
      name: "Gemini 2.0 Flash Image",
      kind: "image",
    },
    {
      id: "veo-3.1-generate",
      name: "Veo 3.1 Generate",
      kind: "video",
    },
  ],
};
