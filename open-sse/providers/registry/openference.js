export default {
  id: "openference",
  alias: "of",
  display: {
    name: "Openference",
    icon: "hub",
    color: "#8B5CF6",
    textIcon: "OF",
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
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
  oauth: {
    clientId: "omniroute",
    tokenUrl: "https://openference.com/oauth/token",
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
