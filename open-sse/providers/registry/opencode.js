export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  // opencode upstream now requires a real API key for chat (the model catalog
  // is public, but chat returns 401 without a key). Keep noAuth so the free
  // catalog still surfaces, but allow an optional API key connection.
  authModes: ["apikey"],
  authHint: "OpenCode Free — optional API key. Chat requires a key; the model list is public.",
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    noAuth: true,
  },
  models: [],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
