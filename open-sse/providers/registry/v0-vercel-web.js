export default {
  id: "v0-vercel-web",
  alias: "v0-web",
  display: {
    name: "V0 Vercel Web",
    icon: "code",
    color: "#000000",
    textIcon: "V0W",
    website: "https://v0.dev",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "v0-vercel-web",
    baseUrl: "https://v0.dev",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "v0-default",
      name: "V0 Default",
    },
  ],
  passthroughModels: true,
};
