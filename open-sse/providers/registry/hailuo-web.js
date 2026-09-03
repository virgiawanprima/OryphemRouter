export default {
  id: "hailuo-web",
  alias: "hailuo-web",
  display: {
    name: "Hailuo Web",
    icon: "video_library",
    color: "#7C3AED",
    textIcon: "HL",
    website: "https://hailuoai.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "hailuo-web",
    baseUrl: "https://chat.minimax.io",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "hailuo",
      name: "Hailuo (MiniMax)",
    },
  ],
};
