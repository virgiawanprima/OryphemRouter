export default {
  id: "ai21",
  alias: "ai21",
  display: {
    name: "AI21",
    icon: "bolt",
    color: "#2563EB",
    textIcon: "21",
    website: "https://www.ai21.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.ai21.com/studio/v1/chat/completions",
    validateUrl: "https://api.ai21.com/studio/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "jamba-large-1.7",
      name: "jamba-large-1.7",
    },
    {
      id: "jamba-mini-2",
      name: "jamba-mini-2",
    },
  ],
};
