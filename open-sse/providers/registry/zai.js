export default {
  id: "zai",
  alias: "zai",
  display: {
    name: "Z.ai",
    icon: "bolt",
    color: "#3859FF",
    textIcon: "ZAI",
    website: "https://z.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "claude",
    executor: "default",
    baseUrl: "https://api.z.ai/api/anthropic/v1/messages",
    urlSuffix: "?beta=true",
    headers: {
      "Anthropic-Version": "2023-06-01",
    },
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "glm-5.3",
      name: "GLM 5.3",
    },
    {
      id: "glm-5.2",
      name: "GLM 5.2",
    },
    {
      id: "glm-5.1",
      name: "GLM 5.1",
    },
    {
      id: "glm-5",
      name: "GLM 5",
    },
    {
      id: "glm-5-turbo",
      name: "GLM 5 Turbo",
    },
    {
      id: "glm-4.7-flash",
      name: "GLM 4.7 Flash",
    },
    {
      id: "glm-4.7",
      name: "GLM 4.7",
    },
  ],
};
