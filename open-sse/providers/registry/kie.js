export default {
  id: "kie",
  priority: 300,
  alias: "kie",
  
  display: {
    name: "KIE",
    color: "#0F172A",
    textIcon: "KI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.kie.ai/v1/chat/completions",
    validateUrl: "https://api.kie.ai/v1/models",
    
  },
  
  models: [
  {
    "id": "claude-fable-5",
    "name": "Claude 5 Fable"
  },
  {
    "id": "claude-opus-5",
    "name": "Claude 5 Opus"
  },
  {
    "id": "claude-sonnet-5",
    "name": "Claude 5 Sonnet"
  },
  {
    "id": "claude-haiku-4-5",
    "name": "Claude 4.5 Haiku"
  },
  {
    "id": "gpt-5-6-sol",
    "name": "GPT 5.6 Sol"
  },
  {
    "id": "gpt-5-6-terra",
    "name": "GPT 5.6 Terra"
  },
  {
    "id": "gpt-5-6-luna",
    "name": "GPT 5.6 Luna"
  },
  {
    "id": "gemini-3-1-pro",
    "name": "Gemini 3.1 Pro"
  },
  {
    "id": "gemini-3-7-flash",
    "name": "Gemini 3.7 Flash"
  },
  {
    "id": "grok-4-6",
    "name": "Grok 4.6"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
