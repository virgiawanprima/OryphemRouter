// LaoZhang AI (api.laozhang.ai) — OpenAI-compatible aggregator gateway.
// No public base URL documented in OmniRoute; api.laozhang.ai/v1 is the conventional
// gateway endpoint — verify against your account before relying on it.
export default {
  id: "laozhang",
  alias: "lz",
  display: {
    name: "LaoZhang AI",
    icon: "hub",
    color: "#FF1744",
    textIcon: "LZ",
    website: "https://api.laozhang.ai",
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.laozhang.ai/v1/chat/completions",
    validateUrl: "https://api.laozhang.ai/v1/models",
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
