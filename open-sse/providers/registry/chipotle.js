export default {
  id: "chipotle",
  alias: "pepper",
  display: {
    name: "Chipotle",
    icon: "local_fire_department",
    color: "#B45309",
    textIcon: "CH",
  },
  category: "freeTier",
  authType: "none",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "chipotle",
    baseUrl: "https://amelia.chipotle.com",
    baseUrls: [
      "https://amelia.chipotle.com",
    ],
  },
  models: [
    {
      id: "pepper-1",
      name: "Pepper (Chipotle AI 🌯)",
    },
  ],
  passthroughModels: true,
};
