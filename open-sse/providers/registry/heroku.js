export default {
  id: "heroku",
  alias: "heroku",
  display: {
    name: "Heroku",
    icon: "cloud",
    color: "#6567A5",
    textIcon: "HK",
    website: "https://www.heroku.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://us.inference.heroku.com/v1/chat/completions",
    validateUrl: "https://us.inference.heroku.com/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "claude-opus-4-7",
      name: "claude-opus-4-7",
    },
    {
      id: "claude-4-6-sonnet",
      name: "claude-4-6-sonnet",
    },
    {
      id: "claude-4-5-haiku",
      name: "claude-4-5-haiku",
    },
    {
      id: "glm-4-7",
      name: "glm-4-7",
    },
    {
      id: "kimi-k2-5",
      name: "kimi-k2-5",
    },
    {
      id: "minimax-m2-1",
      name: "minimax-m2-1",
    },
    {
      id: "deepseek-v3-2",
      name: "deepseek-v3-2",
    },
    {
      id: "qwen3-coder-480b",
      name: "qwen3-coder-480b",
    },
    {
      id: "qwen3-235b",
      name: "qwen3-235b",
    },
    {
      id: "gpt-oss-120b",
      name: "gpt-oss-120b",
    },
    {
      id: "nova-pro",
      name: "nova-pro",
    },
    {
      id: "nova-2-lite",
      name: "nova-2-lite",
    },
  ],
};
