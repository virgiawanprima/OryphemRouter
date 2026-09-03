export default {
  id: "adapta-web",
  alias: "adp-web",
  display: {
    name: "Adapta Web",
    icon: "language",
    color: "#22C55E",
    textIcon: "AD",
    website: "https://adapta.one",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "adapta-web",
    baseUrl: "https://agent.adapta.one/api/chat/stream/v1",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "adapta-one",
      name: "Adapta ONE (Auto)",
      toolCalling: false,
    },
    {
      id: "adapta-gpt",
      name: "GPT-5 (via Adapta)",
      toolCalling: false,
    },
    {
      id: "adapta-claude",
      name: "Claude Sonnet 4.6 (via Adapta)",
      toolCalling: false,
    },
    {
      id: "adapta-gemini",
      name: "Gemini 2.5 Pro (via Adapta)",
      toolCalling: false,
    },
    {
      id: "adapta-grok",
      name: "Grok 4 (via Adapta)",
      toolCalling: false,
    },
    {
      id: "adapta-deepseek",
      name: "DeepSeek R2 (via Adapta)",
      toolCalling: false,
    },
    {
      id: "adapta-llama",
      name: "Llama 4 (via Adapta)",
      toolCalling: false,
    },
  ],
};
