export default {
  id: "predibase",
  alias: "predibase",
  display: {
    name: "Predibase",
    icon: "storage",
    color: "#4F46E5",
    textIcon: "PB",
    website: "https://www.predibase.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://serving.app.predibase.com/v1/chat/completions",
    validateUrl: "https://serving.app.predibase.com/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "llama-3.3-70b",
      name: "llama-3.3-70b",
    },
  ],
};
