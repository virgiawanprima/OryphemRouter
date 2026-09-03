export default {
  id: "zed-hosted",
  display: {
    name: "Zed Hosted",
    icon: "code",
    color: "#111827",
    textIcon: "ZD",
    website: "https://zed.dev",
  },
  category: "oauth",
  authType: "oauth",
  transport: {
    format: "openai",
    executor: "zed-hosted",
    baseUrl: "https://cloud.zed.dev/completions",
    forceStream: true,
    timeoutMs: 120000,
    modelsFetcher: {
      url: "https://cloud.zed.dev/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
