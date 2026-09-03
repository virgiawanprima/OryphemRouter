// FenayAI — OpenAI-compatible aggregator gateway (fenayai.com).
// No public base URL documented in OmniRoute; api.fenayai.com/v1 is the conventional
// gateway endpoint — verify against your account before relying on it.
export default {
  id: "fenayai",
  alias: "fenayai",
  display: {
    name: "FenayAI",
    icon: "hub",
    color: "#FF9800",
    textIcon: "FN",
    website: "https://fenayai.com",
    notice: {
      text: "Bearer API key for the FenayAI OpenAI-compatible gateway.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.fenayai.com/v1/chat/completions",
    validateUrl: "https://api.fenayai.com/v1/models",
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
