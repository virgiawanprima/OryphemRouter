// Lemonade Server — local OpenAI-compatible server (lemonade-server.ai).
// Default base: http://localhost:13305/api/v1. API key optional.
export default {
  id: "lemonade",
  alias: "lemonade",
  display: {
    name: "Lemonade Server",
    icon: "bolt",
    color: "#F59E0B",
    textIcon: "LM",
    website: "https://lemonade-server.ai",
    notice: {
      text: "API key optional. Configure the local Lemonade OpenAI-compatible base URL (default: http://localhost:13305/api/v1).",
    },
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  authModes: ["none", "apikey"],
  transport: {
    baseUrl: "http://localhost:13305/api/v1",
    format: "openai",
    executor: "default",
  },
  models: [],
  passthroughModels: true,
};
