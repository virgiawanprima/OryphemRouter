// 360 AI (360智脑) — OpenAI-compatible chat gateway (ai.360.cn).
export default {
  id: "360ai",
  alias: "360ai",
  display: {
    name: "360 AI",
    icon: "auto_awesome",
    color: "#00B96B",
    textIcon: "360",
    website: "https://ai.360.cn",
    notice: {
      apiKeyUrl: "https://ai.360.cn",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.360.cn/v1/chat/completions",
    validateUrl: "https://api.360.cn/v1/models",
    format: "openai",
    executor: "default",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
