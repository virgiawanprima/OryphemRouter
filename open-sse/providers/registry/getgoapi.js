// GoAPI (getgoapi.com) — OpenAI-compatible aggregator gateway.
// No public base URL documented in OmniRoute; api.getgoapi.com/v1 is the conventional
// gateway endpoint — verify against your account before relying on it.
export default {
  id: "getgoapi",
  alias: "ggo",
  display: {
    name: "GoAPI",
    icon: "rocket_launch",
    color: "#FF6D00",
    textIcon: "GO",
    website: "https://api.getgoapi.com",
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.getgoapi.com/v1/chat/completions",
    validateUrl: "https://api.getgoapi.com/v1/models",
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
