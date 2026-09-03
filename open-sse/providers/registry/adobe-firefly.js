export default {
  id: "adobe-firefly",
  alias: "firefly",
  display: {
    name: "Adobe Firefly",
    icon: "image",
    color: "#EB1000",
    textIcon: "AF",
    website: "https://firefly.adobe.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "adobe-firefly",
    baseUrl: "https://firefly-3p.ff.adobe.io/v2/3p-images/generate-async",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "nano-banana-pro",
      name: "Nano Banana Pro",
      kind: "image",
    },
    {
      id: "sora-2",
      name: "Sora 2",
      kind: "video",
    },
  ],
  serviceKinds: ["image", "video"],
};
