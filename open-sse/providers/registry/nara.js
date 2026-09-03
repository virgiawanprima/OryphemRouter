export default {
  id: "nara",
  display: {
    name: "Nara",
    icon: "spa",
    color: "#E11D48",
    textIcon: "NR",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://router.bynara.id/v1/chat/completions",
    validateUrl: "https://router.bynara.id/v1/models",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "tencent-hy3",
      name: "Tencent Hy3",
      contextLength: 1000000,
    },
    {
      id: "mistral-large",
      name: "Mistral Large",
      contextLength: 252000,
      toolCalling: true,
    },
    {
      id: "mistral-medium-3-5",
      name: "Mistral Medium 3.5",
      contextLength: 256000,
      toolCalling: true,
      supportsVision: true,
    },
  ],
};
