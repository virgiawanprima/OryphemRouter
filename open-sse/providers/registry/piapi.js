// PiAPI (piapi.ai) — API aggregator (image/video/chat). OpenAI-compatible gateway.
// No public base URL documented in OmniRoute; api.piapi.ai/v1 is the conventional
// gateway endpoint — verify against your account before relying on it.
export default {
  id: "piapi",
  alias: "pi",
  display: {
    name: "PiAPI",
    icon: "api",
    color: "#7C4DFF",
    textIcon: "PI",
    website: "https://piapi.ai",
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.piapi.ai/v1/chat/completions",
    validateUrl: "https://api.piapi.ai/v1/models",
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
