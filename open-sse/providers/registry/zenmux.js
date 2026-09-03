export default {
  id: "zenmux",
  priority: 300,
  alias: "zm",
  
  display: {
    name: "zenmux",
    color: "#64748B",
    textIcon: "ZE",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://zenmux.ai/api/v1/chat/completions",
    validateUrl: "https://zenmux.ai/api/v1/models",

  },
  
  models: [
  {
    "id": "google/gemini-3.1-pro-preview",
    "name": "Gemini 3.1 Pro Preview (ZenMux)",
    "contextLength": 1048576
  },
  {
    "id": "google/gemini-3-flash-preview",
    "name": "Gemini 3 Flash Preview (ZenMux)",
    "contextLength": 1048576
  },
  {
    "id": "openai/gpt-5",
    "name": "GPT-5 (ZenMux)",
    "contextLength": 400000
  },
  {
    "id": "anthropic/claude-sonnet-4.5",
    "name": "Claude Sonnet 4.5 (ZenMux)",
    "contextLength": 200000
  },
  {
    "id": "anthropic/claude-opus-4.5",
    "name": "Claude Opus 4.5 (ZenMux)",
    "contextLength": 200000
  },
  {
    "id": "deepseek/deepseek-chat",
    "name": "DeepSeek V3.2 Chat (ZenMux)",
    "contextLength": 128000
  },
  {
    "id": "x-ai/grok-4.1-fast",
    "name": "Grok 4.1 Fast (ZenMux)",
    "contextLength": 131072
  },
  {
    "id": "mistralai/mistral-large-2512",
    "name": "Mistral Large 2512 (ZenMux)",
    "contextLength": 128000
  },
  {
    "id": "z-ai/glm-4.6v-flash",
    "name": "GLM 4.6V Flash (ZenMux)",
    "contextLength": 128000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
