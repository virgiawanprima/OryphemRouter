export default {
  id: "bytez",
  alias: "bytez",
  display: {
    name: "Bytez",
    icon: "memory",
    color: "#0891B2",
    textIcon: "BZ",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.bytez.com/models/v2/openai/v1/chat/completions",
    validateUrl: "https://api.bytez.com/models/v2/openai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      name: "meta-llama/Llama-3.3-70B-Instruct",
    },
    {
      id: "mistralai/Mistral-7B-Instruct-v0.3",
      name: "mistralai/Mistral-7B-Instruct-v0.3",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      name: "Qwen/Qwen2.5-72B-Instruct",
    },
  ],
};
