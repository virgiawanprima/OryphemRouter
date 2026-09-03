export default {
  id: "deepai",
  alias: "deepai",
  display: {
    name: "DeepAI",
    icon: "bolt",
    color: "#F97316",
    textIcon: "DA",
    website: "https://deepai.org",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "custom",
    executor: "default",
    baseUrl: "https://api.deepai.org",
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "text2img",
      name: "Text to Image",
    },
  ],
};
