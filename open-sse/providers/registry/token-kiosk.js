export default {
  id: "token-kiosk",
  priority: 300,
  alias: "tk",
  
  display: {
    name: "token-kiosk",
    color: "#64748B",
    textIcon: "TO",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://agent-router.gaib.ai/v1/chat/completions",
    validateUrl: "https://agent-router.gaib.ai/v1/models",

  },
  
  models: [
  {
    "id": "claude-3-5-sonnet",
    "name": "Claude 3.5 Sonnet (Token Kiosk)",
    "contextLength": 200000
  },
  {
    "id": "deepseek-v3",
    "name": "DeepSeek V3 (Token Kiosk)",
    "contextLength": 64000
  },
  {
    "id": "deepseek-r1",
    "name": "DeepSeek R1 (Token Kiosk)",
    "contextLength": 64000
  },
  {
    "id": "kimi-k1.5",
    "name": "Kimi K1.5 (Token Kiosk)",
    "contextLength": 128000
  },
  {
    "id": "minimax-m6",
    "name": "MiniMax M6 (Token Kiosk)",
    "contextLength": 128000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
