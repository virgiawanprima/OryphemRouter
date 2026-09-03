export default {
  id: "promptql",
  alias: "pql",
  display: {
    name: "PromptQL",
    icon: "query_stats",
    color: "#059669",
    textIcon: "PQL",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "promptql",
    baseUrl: "https://data.prompt.ql.app/promptql/playground-v2-hge/v1/graphql",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "bedrock-claude-fable-5",
      name: "Claude Fable 5",
      supportsVision: true,
    },
    {
      id: "bedrock-claude-opus-5",
      name: "Claude Opus 5",
      supportsVision: true,
    },
    {
      id: "bedrock-claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      supportsVision: true,
    },
    {
      id: "deepseek-v4-pro-0813",
      name: "DeepSeek V4 Pro 0813",
      supportsVision: true,
    },
    {
      id: "deepseek-v4-flash-0731",
      name: "DeepSeek V4 Flash 0731",
      supportsVision: true,
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      supportsVision: true,
    },
    {
      id: "gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      supportsVision: true,
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      supportsVision: true,
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      supportsVision: true,
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      supportsVision: true,
    },
    {
      id: "xai-grok-4-6",
      name: "Grok 4.6",
      supportsVision: true,
    },
    {
      id: "kimi-k3",
      name: "Kimi K3",
      supportsVision: true,
    },
    {
      id: "glm-5.2",
      name: "GLM 5.2",
    },
    {
      id: "minimax-m3",
      name: "Minimax M3",
    },
  ],
  passthroughModels: true,
};
