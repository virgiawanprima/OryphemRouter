export default {
  id: "cliproxyapi",
  alias: "cpa",
  display: {
    name: "CLIProxyAPI",
    icon: "terminal",
    color: "#0F172A",
    textIcon: "CPA",
    website: "https://github.com/clems4ever/CLIProxyAPI",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "cliproxyapi",
    baseUrl: "http://127.0.0.1:8317/v1/chat/completions",
    validateUrl: "http://127.0.0.1:8317/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
