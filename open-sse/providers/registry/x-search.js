export default {
  id: "x-search",
  alias: "x_search",
  display: {
    name: "X Search (Grok)",
    icon: "tag",
    color: "#000000",
    textIcon: "X",
    website: "https://docs.x.ai/developers/tools/x-search",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.x.ai/v1/responses",
    validateUrl: "https://api.x.ai/v1/models",
    format: "openai",
  },
  serviceKinds: [
    "webSearch"
  ],
};
