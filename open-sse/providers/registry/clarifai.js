// Clarifai — OpenAI-compatible endpoint at /v2/ext/openai/v1.
// Auth: `Authorization: Key <token>` (PAT or app-scoped key).
export default {
  id: "clarifai",
  alias: "clarifai",
  display: {
    name: "Clarifai",
    icon: "hub",
    color: "#7C3AED",
    textIcon: "CF",
    website: "https://docs.clarifai.com",
    notice: {
      text: "Use your Clarifai PAT or app-specific API key. Clarifai expects `Authorization: Key <token>`.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.clarifai.com/v2/ext/openai/v1/chat/completions",
    validateUrl: "https://api.clarifai.com/v2/ext/openai/v1/models",
    format: "openai",
    executor: "default",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "raw",
    },
  },
  models: [],
  passthroughModels: true,
};
