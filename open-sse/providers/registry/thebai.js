// TheB.AI (theb.ai) — OpenAI-compatible aggregator gateway.
// Conventional OpenAI-compatible endpoint: https://api.theb.ai/v1/chat/completions.
export default {
  id: "thebai",
  alias: "thebai",
  display: {
    name: "TheB.AI",
    icon: "hub",
    color: "#3B82F6",
    textIcon: "TB",
    website: "https://theb.ai",
    notice: {
      text: "Bearer API key for the TheB.AI OpenAI-compatible gateway.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.theb.ai/v1/chat/completions",
    validateUrl: "https://api.theb.ai/v1/models",
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
