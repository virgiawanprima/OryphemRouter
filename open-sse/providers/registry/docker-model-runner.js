export default {
  id: "docker-model-runner",
  alias: "dmr",
  display: {
    name: "Docker Model Runner",
    icon: "inventory_2",
    color: "#2496ED",
    textIcon: "DM",
    website: "https://docs.docker.com/ai/model-runner/",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:12434/v1",
    format: "openai",
  },
  passthroughModels: true,
};
