// Codex Cloud — OpenAI cloud coding-agent API (tasks under /codex/cloud/tasks).
// OAuth-category cloud agent (task/session management, not chat completions).
// Base: https://api.openai.com/v1 (agent tasks) — no dedicated executor yet.
export default {
  id: "codex-cloud",
  alias: "codex-cloud",
  display: {
    name: "Codex Cloud",
    icon: "cloud",
    color: "#10A37F",
    textIcon: "CC",
    website: "https://openai.com/codex",
    notice: {
      text: "OpenAI API key with Codex Cloud task access.",
    },
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  authModes: ["oauth"],
  transport: {
    baseUrl: "https://api.openai.com/v1",
    format: "openai",
  },
  models: [],
};
