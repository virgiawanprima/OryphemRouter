export default {
  id: "g4f-groq",
  alias: "g4fgroq",
  display: {
    name: "G4F Groq",
    icon: "bolt",
    color: "#F55036",
    textIcon: "G4R",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://g4f.space/api/groq/v1/chat/completions",
    modelsFetcher: {
      url: "https://g4f.space/api/groq/v1/models",
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
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B (g4f/Groq)",
    },
    {
      id: "llama-3.1-8b-instant",
      name: "Llama 3.1 8B Instant (g4f/Groq)",
    },
  ],
  passthroughModels: true,
};
