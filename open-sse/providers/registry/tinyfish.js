// TinyFish Fetch — web-fetch provider (docs.tinyfish.ai/fetch-api).
// Auth header: X-API-Key from agent.tinyfish.ai/api-keys. Uses the tinyfish-fetch executor.
export default {
  id: "tinyfish",
  alias: "tf",
  display: {
    name: "TinyFish Fetch",
    icon: "language",
    color: "#0891B2",
    textIcon: "TF",
    website: "https://docs.tinyfish.ai/fetch-api",
    notice: {
      text: "Fetch does not use TinyFish credits. Submit up to 10 URLs per request.",
      apiKeyUrl: "https://agent.tinyfish.ai/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.fetch.tinyfish.ai",
    format: "openai",
    executor: "tinyfish-fetch",
    auth: {
      combined: true,
      header: "X-API-Key",
      scheme: "raw",
    },
  },
  serviceKinds: ["webFetch"],
  models: [],
};
