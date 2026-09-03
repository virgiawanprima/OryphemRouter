export default {
  id: "galadriel",
  alias: "galadriel",
  display: {
    name: "Galadriel",
    icon: "auto_awesome",
    color: "#7C3AED",
    textIcon: "GA",
    website: "https://www.galadriel.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.galadriel.ai/v1/chat/completions",
    validateUrl: "https://api.galadriel.ai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "galadriel-latest",
      name: "galadriel-latest",
    },
  ],
};
