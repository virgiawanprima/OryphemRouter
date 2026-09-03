export default {
  id: "codestral",
  alias: "codestral",
  display: {
    name: "Codestral",
    icon: "terminal",
    color: "#FA520F",
    textIcon: "CS",
    website: "https://mistral.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://codestral.mistral.ai/v1/chat/completions",
    validateUrl: "https://codestral.mistral.ai/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "codestral-2508",
      name: "codestral-2508",
    },
    {
      id: "codestral-latest",
      name: "codestral-latest",
    },
  ],
};
