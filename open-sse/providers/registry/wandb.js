export default {
  id: "wandb",
  alias: "wandb",
  display: {
    name: "Weights & Biases",
    icon: "insights",
    color: "#FFBE00",
    textIcon: "WB",
    website: "https://wandb.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.inference.wandb.ai/v1/chat/completions",
    validateUrl: "https://api.inference.wandb.ai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "openai/gpt-oss-120b",
      name: "openai/gpt-oss-120b",
    },
    {
      id: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      name: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    },
    {
      id: "deepseek-ai/DeepSeek-V3.1",
      name: "deepseek-ai/DeepSeek-V3.1",
    },
  ],
};
