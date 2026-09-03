export default {
  id: "lm-studio",
  alias: "lmstudio",
  display: {
    name: "LM Studio",
    icon: "server",
    color: "#4A148C",
    textIcon: "LM",
    website: "https://lmstudio.ai",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:1234/v1",
    format: "openai",
  },
  passthroughModels: true,
};
