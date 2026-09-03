export default {
  id: "mlx-gemma",
  alias: "mlx-gemma",
  display: {
    name: "MLX Gemma",
    icon: "memory",
    color: "#B45309",
    textIcon: "MXG",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "http://localhost:11435/v1",
    timeoutMs: 120000,
    modelsFetcher: {
      url: "http://localhost:11435/v1/models",
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
      id: "mlx-community/gemma-4-26B-A4B-it-qat-q4_0-mlx-aligned",
      name: "Gemma 4 26B A4B IT-QAT (MLX)",
      toolCalling: true,
      supportsVision: false,
      supportsReasoning: false,
      contextLength: 8192,
      maxOutputTokens: 8192,
    },
  ],
};
