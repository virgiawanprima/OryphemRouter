export default {
  id: "cloudcode-one",
  alias: "cloudcode-one",
  display: {
    name: "Cloudcode One",
    icon: "bolt",
    color: "hsl(203, 60%, 45%)",
    textIcon: "CO",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.cloudcode.one/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.cloudcode.one/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "glm-4.7-flash",
      name: "GLM 4.7 Flash",
    },
    {
      id: "glm-4.6v-flash",
      name: "GLM 4.6V Flash",
    },
  ],
  passthroughModels: true,
};
