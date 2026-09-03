// Context7 (library docs) — search/fetch provider via the context7-fetch executor.
// Anonymous tier works without a key; a ctx7sk-... key raises the rate limit.
export default {
  id: "context7",
  alias: "context7",
  display: {
    name: "Context7 (library docs)",
    icon: "menu_book",
    color: "#6B4FBB",
    textIcon: "C7",
    website: "https://context7.com",
    notice: {
      text: "API key optional (ctx7sk-...) — anonymous tier works without a key; a key raises the rate limit.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey", "none"],
  transport: {
    baseUrl: "https://context7.com/api/v1",
    format: "openai",
    executor: "context7-fetch",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  serviceKinds: ["webSearch", "webFetch"],
  models: [],
};
