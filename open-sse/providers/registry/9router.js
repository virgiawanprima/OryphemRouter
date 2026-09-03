// 9router — embedded local upstream-proxy router (npm package `9router`).
// Runs as a local service on port 20130 (health: /api/health), OpenAI-compatible.
export default {
  id: "9router",
  alias: "nr",
  display: {
    name: "9router",
    icon: "router",
    color: "#0EA5E9",
    textIcon: "9R",
    website: "https://www.npmjs.com/package/9router",
    notice: {
      text: "Embedded local service. Install the `9router` npm package; it listens on localhost:20130.",
    },
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  authModes: ["none"],
  transport: {
    baseUrl: "http://localhost:20130",
    format: "openai",
    executor: "default",
  },
  models: [],
  passthroughModels: true,
};
