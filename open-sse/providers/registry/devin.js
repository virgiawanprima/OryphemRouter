// Devin (cloud agent) — Devin cloud coding-agent API (sessions/messages under api.devin.ai/v1).
// Distinct from `devin-cli` (local CLI via stdio) and `devin-desktop`. No chat models.
export default {
  id: "devin",
  alias: "devin",
  display: {
    name: "Devin",
    icon: "smart_toy",
    color: "#111827",
    textIcon: "DV",
    website: "https://devin.ai",
    notice: {
      text: "Devin API key for cloud agent sessions.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.devin.ai/v1",
    format: "openai",
    executor: "default",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
};
