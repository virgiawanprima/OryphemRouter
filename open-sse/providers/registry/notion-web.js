export default {
  id: "notion-web",
  alias: "nw",
  display: {
    name: "Notion Web",
    icon: "web",
    color: "#111827",
    textIcon: "NT",
    website: "https://www.notion.so",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "notion-web",
    baseUrl: "https://app.notion.com/api/v3/runInferenceTranscript",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "notion-ai",
      name: "Notion AI (default)",
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
    },
    {
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
    },
    {
      id: "fable-5",
      name: "Claude Fable 5",
    },
    {
      id: "opus-5",
      name: "Claude Opus 5",
    },
    {
      id: "sonnet-5",
      name: "Claude Sonnet 5",
    },
    {
      id: "haiku-4.5",
      name: "Claude Haiku 4.5",
    },
    {
      id: "grok-4.6",
      name: "Grok 4.6",
    },
    {
      id: "kimi-k3",
      name: "Kimi K3",
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
    },
    {
      id: "glm-5.2",
      name: "GLM 5.2",
    },
  ],
  passthroughModels: true,
};
