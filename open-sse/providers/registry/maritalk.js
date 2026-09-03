export default {
  id: "maritalk",
  alias: "maritalk",
  display: {
    name: "MariTalk",
    icon: "record_voice_over",
    color: "#2563EB",
    textIcon: "MT",
    website: "https://maritaca.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://chat.maritaca.ai/api",
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "sabia-4",
      name: "sabia-4",
    },
    {
      id: "sabia-4-thinking",
      name: "sabia-4-thinking",
    },
    {
      id: "sabiazinho-4",
      name: "sabiazinho-4",
    },
  ],
};
