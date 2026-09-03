export default {
  id: "zai-web",
  alias: "zw",
  display: {
    name: "Z.ai Web",
    icon: "chat",
    color: "#4F46E5",
    textIcon: "ZW",
    website: "https://chat.z.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "zai-web",
    baseUrl: "https://chat.z.ai",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "GLM-5.1",
      name: "GLM-5.1",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "GLM-5-Turbo",
      name: "GLM-5-Turbo",
      toolCalling: false,
      supportsReasoning: true,
    },
    {
      id: "GLM-5v-Turbo",
      name: "GLM-5V-Turbo",
      toolCalling: false,
      supportsReasoning: true,
      supportsVision: true,
    },
  ],
};
