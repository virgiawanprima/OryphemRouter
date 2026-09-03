export default {
  id: "dxnt",
  alias: "dxnt",
  display: {
    name: "DXNT",
    icon: "bolt",
    color: "#4F46E5",
    textIcon: "DX",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://www.dxnt.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://www.dxnt.com/v1/models",
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
