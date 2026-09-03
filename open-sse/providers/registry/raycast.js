export default {
  id: "raycast",
  alias: "rc",
  display: {
    name: "Raycast",
    icon: "bolt",
    color: "#FF6363",
    textIcon: "RC",
    website: "https://www.raycast.com",
  },
  category: "oauth",
  authType: "oauth",
  transport: {
    format: "openai",
    executor: "raycast",
    baseUrl: "https://backend.raycast.com/api/v1/ai",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "openai-gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      contextLength: 128000,
    },
    {
      id: "openai-gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      contextLength: 128000,
    },
    {
      id: "openai-gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      contextLength: 128000,
    },
    {
      id: "anthropic-claude-opus-5",
      name: "Claude Opus 5",
      contextLength: 128000,
    },
    {
      id: "anthropic-claude-sonnet-5",
      name: "Claude Sonnet 5",
      contextLength: 128000,
    },
    {
      id: "anthropic-claude-4-5-haiku-reasoning",
      name: "Claude 4.5 Haiku Reasoning",
      contextLength: 128000,
    },
    {
      id: "anthropic-claude-4-5-haiku",
      name: "Claude 4.5 Haiku",
      contextLength: 128000,
    },
    {
      id: "google-gemini-3.1-pro",
      name: "Gemini 3.1 Pro",
      contextLength: 128000,
    },
    {
      id: "google-gemini-3.7-flash",
      name: "Gemini 3.7 Flash",
      contextLength: 128000,
    },
    {
      id: "google-gemini-3.5-flash-lite",
      name: "Gemini 3.5 Flash Lite",
      contextLength: 128000,
    },
    {
      id: "perplexity-sonar-reasoning-pro",
      name: "Sonar Reasoning Pro",
      contextLength: 128000,
    },
    {
      id: "perplexity-sonar-pro",
      name: "Sonar Pro",
      contextLength: 128000,
    },
    {
      id: "perplexity-sonar",
      name: "Sonar",
      contextLength: 128000,
    },
    {
      id: "mistral-mistral-large-latest",
      name: "Mistral Large",
      contextLength: 128000,
    },
    {
      id: "mistral-mistral-medium-latest",
      name: "Mistral Medium",
      contextLength: 128000,
    },
    {
      id: "mistral-mistral-small-latest",
      name: "Mistral Small",
      contextLength: 128000,
    },
    {
      id: "mistral-codestral-latest",
      name: "Codestral",
      contextLength: 128000,
    },
    {
      id: "mistral-open-mistral-nemo",
      name: "Mistral Nemo",
      contextLength: 128000,
    },
    {
      id: "xai-grok-4.6",
      name: "Grok 4.6",
      contextLength: 128000,
    },
    {
      id: "gateway-alibaba/qwen3.8-max",
      name: "Qwen 3.8 Max",
      contextLength: 128000,
    },
    {
      id: "gateway-moonshotai/kimi-k3",
      name: "Kimi K3",
      contextLength: 128000,
    },
    {
      id: "baseten-deepseek-ai/DeepSeek-V4-Pro",
      name: "DeepSeek V4 Pro",
      contextLength: 128000,
    },
    {
      id: "gateway-deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      contextLength: 128000,
    },
    {
      id: "baseten-zai-org/GLM-5.2",
      name: "GLM 5.2",
      contextLength: 128000,
    },
    {
      id: "gateway-thinkingmachines/inkling-1.0",
      name: "Inkling 1.0",
      contextLength: 128000,
    },
    {
      id: "gateway-google/gemma-4-31b-it",
      name: "Gemma 4 31B",
      contextLength: 128000,
    },
    {
      id: "groq-openai/gpt-oss-120b",
      name: "GPT-OSS 120B",
      contextLength: 128000,
    },
    {
      id: "groq-openai/gpt-oss-20b",
      name: "GPT-OSS 20B",
      contextLength: 128000,
    },
    {
      id: "groq-qwen/qwen3-32b",
      name: "Qwen 3 32B",
      contextLength: 128000,
    },
    {
      id: "groq-llama-3.3-70b-versatile",
      name: "LLaMA 3.3 70B",
      contextLength: 128000,
    },
    {
      id: "groq-llama-3.1-8b-instant",
      name: "LLaMA 3.1 8B",
      contextLength: 128000,
    },
  ],
};
