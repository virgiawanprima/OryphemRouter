export default {
  id: "muse-spark-web",
  alias: "ms-web",
  display: {
    name: "Muse Spark Web",
    icon: "web",
    color: "#8B5CF6",
    textIcon: "MSW",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "muse-spark-web",
    baseUrl: "https://www.meta.ai/api/graphql",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "muse-spark",
      name: "Muse Spark",
      toolCalling: false,
    },
    {
      id: "muse-spark-thinking",
      name: "Muse Spark Thinking",
      supportsReasoning: true,
    },
    {
      id: "muse-spark-contemplating",
      name: "Muse Spark Contemplating",
      supportsReasoning: true,
    },
  ],
};
