// Fish Audio TTS — POST https://api.fish.audio/v1/tts, model travels in an HTTP header.
export default {
  id: "fishaudio",
  alias: "fishaudio",
  display: {
    name: "Fish Audio",
    icon: "graphic_eq",
    color: "#3B82F6",
    textIcon: "FA",
    website: "https://fish.audio",
    notice: {
      apiKeyUrl: "https://fish.audio/app/api-keys/",
    },
  },
  category: "apikey",
  authType: "apikey",
  models: [
    { id: "s1", name: "Fish Speech S1", kind: "tts" },
    { id: "speech-1.6", name: "Fish Speech 1.6", kind: "tts" },
    { id: "speech-1.5", name: "Fish Speech 1.5", kind: "tts" },
  ],
  serviceKinds: ["tts"],
  ttsConfig: { baseUrl: "https://api.fish.audio/v1/tts", authType: "apikey", authHeader: "bearer", format: "fishaudio" },
};
