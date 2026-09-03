export default {
  id: "g4f-nvidia",
  alias: "g4fnv",
  display: {
    name: "G4F Nvidia",
    icon: "bolt",
    color: "#76B900",
    textIcon: "G4N",
  },
  category: "freeTier",
  authType: "optional",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://g4f.space/api/nvidia/v1/chat/completions",
    modelsFetcher: {
      url: "https://g4f.space/api/nvidia/v1/models",
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
      id: "nvidia/nemotron-3-nano-30b-a3b",
      name: "Nemotron 3 Nano 30B (g4f/NVIDIA)",
    },
    {
      id: "z-ai/glm-5.2",
      name: "GLM 5.2 (g4f/NVIDIA)",
    },
    {
      id: "minimaxai/minimax-m2.7",
      name: "MiniMax M2.7 (g4f/NVIDIA)",
    },
  ],
  passthroughModels: true,
};
