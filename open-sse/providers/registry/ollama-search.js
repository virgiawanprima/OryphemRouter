export default {
  id: "ollama-search",
  alias: "ollama-search",
  display: {
    name: "Ollama Search",
    icon: "search",
    color: "#58A6FF",
    textIcon: "OS",
    website: "https://ollama.com/settings/keys",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://ollama.com/api/web_search",
    format: "openai",
  },
  serviceKinds: [
    "webSearch"
  ],
};
