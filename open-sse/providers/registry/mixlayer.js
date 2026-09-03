export default {
  id: "mixlayer",
  alias: "mixlayer",
  display: {
    name: "MixLayer",
    icon: "layers",
    color: "#7C3AED",
    textIcon: "ML",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://models.mixlayer.ai/v1/chat/completions",
    modelsFetcher: {
      url: "https://models.mixlayer.ai/v1/models",
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
      id: "qwen/qwen3.5-4b-free",
      name: "Qwen 3.5 4B (free)",
    },
  ],
  passthroughModels: true,
};
