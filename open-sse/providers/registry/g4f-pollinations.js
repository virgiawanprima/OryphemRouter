export default {
  id: "g4f-pollinations",
  alias: "g4fpol",
  display: {
    name: "G4F Pollinations",
    icon: "bolt",
    color: "#D946EF",
    textIcon: "G4P",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://g4f.space/api/pollinations/v1/chat/completions",
    modelsFetcher: {
      url: "https://g4f.space/api/pollinations/v1/models",
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
      id: "openai",
      name: "OpenAI (g4f/Pollinations)",
    },
    {
      id: "openai-fast",
      name: "OpenAI Fast (g4f/Pollinations)",
    },
  ],
  passthroughModels: true,
};
