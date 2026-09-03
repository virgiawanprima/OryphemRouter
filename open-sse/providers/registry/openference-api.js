export default {
  id: "openference-api",
  alias: "ofa",
  display: {
    name: "Openference API",
    icon: "api",
    color: "#7C3AED",
    textIcon: "OFA",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.openference.com/v1/chat/completions",
    validateUrl: "https://api.openference.com/v1/models",
    responsesUrl: "https://api.openference.com/v1/responses",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "GLM-5.2",
      name: "GLM 5.2",
      contextLength: 850000,
    },
  ],
  passthroughModels: true,
};
