export default {
  id: "imagen3",
  alias: "imagen3",
  display: {
    name: "Google Imagen 3",
    icon: "image",
    color: "#4285F4",
    textIcon: "IM",
    website: "https://deepmind.google/technologies/imagen-3",
    kindNotice: { image: "Google Imagen 3 image generation (Gemini API key)." },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: "imagen3",
    executor: "default",
  },
  serviceKinds: ["image"],
  imageConfig: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/models" },
  models: [
    { id: "imagen-3.0-generate-002", name: "Imagen 3" },
    { id: "imagen-4.0", name: "Imagen 4.0" },
  ],
};
