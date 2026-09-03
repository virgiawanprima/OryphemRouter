// Arcee AI — OpenAI-compatible hosted platform (arcee.ai).
// Docs list Base URL: https://api.arcee.ai/api/v1 (Kilo Code integration page).
export default {
  id: "arcee-ai",
  alias: "arcee",
  aliases: ["arcee-ai"],
  display: {
    name: "Arcee AI",
    icon: "auto_awesome",
    color: "#8B5CF6",
    textIcon: "AR",
    website: "https://arcee.ai",
    notice: {
      apiKeyUrl: "https://arcee.ai",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.arcee.ai/api/v1/chat/completions",
    validateUrl: "https://api.arcee.ai/api/v1/models",
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
