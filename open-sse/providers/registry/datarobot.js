// DataRobot — LLM Gateway (OpenAI-compatible) or deployment URLs.
// Default gateway root: https://app.datarobot.com (chat via /api/v2/genai/llmgw/chat/completions/).
export default {
  id: "datarobot",
  alias: "datarobot",
  display: {
    name: "DataRobot",
    icon: "precision_manufacturing",
    color: "#6D28D9",
    textIcon: "DR",
    website: "https://docs.datarobot.com",
    notice: {
      text: "Use your DataRobot API token. Optional Base URL can be the account root (for LLM Gateway) or a deployment URL under /api/v2/deployments/<id>.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://app.datarobot.com",
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
