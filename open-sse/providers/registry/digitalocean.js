export default {
  id: "digitalocean",
  alias: "digitalocean",
  display: {
    name: "DigitalOcean",
    icon: "cloud",
    color: "#0069FF",
    textIcon: "DO",
    website: "https://www.digitalocean.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://inference.do-ai.run/v1/chat/completions",
    modelsFetcher: {
      url: "https://inference.do-ai.run/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
