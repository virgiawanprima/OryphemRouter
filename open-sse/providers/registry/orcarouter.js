export default {
  id: "orcarouter",
  priority: 300,
  alias: "orcarouter",
  
  display: {
    name: "OrcaRouter",
    color: "#0EA5E9",
    textIcon: "OR",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.orcarouter.ai/v1",
    
  },
  
  models: [
  {
    "id": "orcarouter/auto",
    "name": "Auto (smart routing)",
    "contextLength": 1050000
  },
  {
    "id": "openai/gpt-5.5",
    "name": "GPT-5.5",
    "contextLength": 1050000
  },
  {
    "id": "google/gemini-3.6-flash",
    "name": "Gemini 3.6 Flash",
    "contextLength": 1048576
  },
  {
    "id": "anthropic/claude-opus-4.8",
    "name": "Claude Opus 4.8",
    "contextLength": 1000000
  },
  {
    "id": "grok/grok-4.3",
    "name": "Grok 4.3",
    "contextLength": 1000000
  },
  {
    "id": "deepseek/deepseek-v4-pro",
    "name": "DeepSeek V4 Pro",
    "contextLength": 1048576
  },
  {
    "id": "minimax/minimax-m2.7",
    "name": "MiniMax M2.7",
    "contextLength": 204800
  },
  {
    "id": "qwen/qwen3.7-max",
    "name": "Qwen3.7 Max",
    "contextLength": 1000000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
