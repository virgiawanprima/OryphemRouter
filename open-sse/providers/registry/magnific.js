// Magnific Mystic — image provider (docs.magnific.com). Custom async format:
// submit task, then poll GET /{task_id}. Auth header: x-magnific-api-key.
// Legacy Freepik developer keys still work (legacy alias `freepik`).
export default {
  id: "magnific",
  alias: "freepik",
  aliases: ["magnific"],
  display: {
    name: "Magnific",
    icon: "image",
    color: "#1B9E7F",
    textIcon: "MG",
    website: "https://www.magnific.com",
    notice: {
      apiKeyUrl: "https://www.magnific.com/user/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.magnific.com/v1/ai/mystic",
    format: "magnific-image",
    executor: "default",
    auth: {
      combined: true,
      header: "x-magnific-api-key",
      scheme: "raw",
    },
  },
  models: [
    { id: "realism", name: "Mystic Realism", type: "image" },
    { id: "fluid", name: "Mystic Fluid (Imagen 3)", type: "image" },
    { id: "zen", name: "Mystic Zen", type: "image" },
    { id: "flexible", name: "Mystic Flexible", type: "image" },
    { id: "super_real", name: "Mystic Super Real", type: "image" },
    { id: "editorial_portraits", name: "Mystic Editorial Portraits", type: "image" },
  ],
  supportedSizes: ["1024x1024", "1024x1792", "1792x1024"],
};
