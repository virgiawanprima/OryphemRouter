export default {
  id: "suno",
  alias: "suno",
  display: {
    name: "Suno",
    icon: "music_note",
    color: "#111827",
    textIcon: "SU",
    website: "https://suno.com",
  },
  category: "webCookie",
  authType: "cookie",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://studio-api.suno.ai/api/generate/v2/",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "chirp-fenix",
      name: "Chirp V5.5",
    },
    {
      id: "chirp-crow",
      name: "Chirp V5",
    },
    {
      id: "chirp-v4",
      name: "Chirp V4",
    },
    {
      id: "chirp-v3-5",
      name: "Chirp V3.5",
    },
  ],
};
