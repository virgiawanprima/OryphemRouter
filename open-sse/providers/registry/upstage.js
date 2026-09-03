export default {
  id: "upstage",
  alias: "upstage",
  display: {
    name: "Upstage",
    icon: "theater_comedy",
    color: "#7C3AED",
    textIcon: "US",
    website: "https://www.upstage.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.upstage.ai/v1/chat/completions",
    validateUrl: "https://api.upstage.ai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "solar-pro3",
      name: "solar-pro3",
    },
    {
      id: "solar-mini",
      name: "solar-mini",
    },
  ],
};
