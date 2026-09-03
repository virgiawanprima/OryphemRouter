export default {
  id: "g4f-gemini",
  alias: "g4fgem",
  display: {
    name: "G4F Gemini",
    icon: "bolt",
    color: "#4285F4",
    textIcon: "G4G",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://g4f.space/api/gemini/v1/chat/completions",
    modelsFetcher: {
      url: "https://g4f.space/api/gemini/v1/models",
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
      id: "models/gemini-2.5-flash",
      name: "Gemini 2.5 Flash (g4f)",
    },
    {
      id: "models/gemini-2.5-pro",
      name: "Gemini 2.5 Pro (g4f)",
    },
  ],
  passthroughModels: true,
};
