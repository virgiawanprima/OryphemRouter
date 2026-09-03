export default {
  id: "veoaifree-web",
  alias: "veo-free",
  display: {
    name: "VeoAI Free Web",
    icon: "video_library",
    color: "#4285F4",
    textIcon: "VA",
  },
  category: "freeTier",
  authType: "none",
  noAuth: true,
  transport: {
    format: "openai",
    executor: "veoaifree-web",
    baseUrl: "https://veoaifree.com/wp-admin/admin-ajax.php",
  },
  models: [
    {
      id: "veo",
      name: "VEO 3.1",
      toolCalling: false,
    },
    {
      id: "seedance",
      name: "Seedance",
      toolCalling: false,
    },
  ],
};
