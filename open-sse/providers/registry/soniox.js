// Soniox STT — async batch transcription (upload file → poll job → fetch transcript).
export default {
  id: "soniox",
  alias: "sx",
  display: {
    name: "Soniox",
    icon: "mic",
    color: "#5B5BD6",
    textIcon: "SX",
    website: "https://soniox.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: { baseUrl: "https://api.soniox.com/v1/transcriptions" },
  models: [
    { id: "stt-async-v5", name: "Soniox STT Async v5", kind: "stt" },
    { id: "stt-async-v4", name: "Soniox STT Async v4", kind: "stt" },
  ],
  serviceKinds: ["stt"],
  sttConfig: { baseUrl: "https://api.soniox.com/v1/transcriptions", authType: "apikey", authHeader: "bearer", format: "soniox" },
};
