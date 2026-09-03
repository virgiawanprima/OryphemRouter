export default {
  id: "mlx-qwen",
  alias: "mlx-qwen",
  display: {
    name: "MLX Qwen",
    icon: "memory",
    color: "#4F46E5",
    textIcon: "MXQ",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "http://localhost:11436/v1",
    timeoutMs: 120000,
    modelsFetcher: {
      url: "http://localhost:11436/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "maglun/Qwen3.8-27B-MLX-Mixed-3.80bpw",
      name: "Qwen 3.8 27B MLX Mixed 3.80bpw",
      toolCalling: true,
      supportsVision: false,
      supportsReasoning: false,
      contextLength: 8192,
      maxOutputTokens: 8192,
    },
  ],
};
