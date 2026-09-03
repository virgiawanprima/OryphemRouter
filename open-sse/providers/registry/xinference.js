export default {
  id: "xinference",
  alias: "xinference",
  display: {
    name: "XInference",
    icon: "hub",
    color: "#DC2626",
    textIcon: "XI",
    website: "https://inference.readthedocs.io",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:9997/v1",
    format: "openai",
  },
  passthroughModels: true,
};
