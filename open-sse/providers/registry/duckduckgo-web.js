export default {
  id: "duckduckgo-web",
  alias: "ddgw",
  display: {
    name: "DuckDuckGo Web",
    icon: "search",
    color: "#DE5833",
    textIcon: "DDG",
    website: "https://duckduckgo.com",
  },
  category: "freeTier",
  authType: "none",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "duckduckgo-web",
    baseUrl: "https://duck.ai/duckchat/v1/chat",
  },
  models: [
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      toolCalling: false,
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      toolCalling: false,
    },
    {
      id: "claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      toolCalling: false,
    },
    {
      id: "mistral-small-2603",
      name: "Mistral Small 4",
      toolCalling: false,
    },
    {
      id: "tinfoil/gpt-oss-120b",
      name: "gpt-oss 120B",
      toolCalling: false,
    },
    {
      id: "tinfoil/gemma4-31b",
      name: "Gemma 4 31B",
      toolCalling: false,
    },
  ],
};
