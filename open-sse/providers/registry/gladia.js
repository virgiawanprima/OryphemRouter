// Gladia STT — async workflow (POST /v2/pre-recorded: upload → submit → poll).
// Auth: x-gladia-key header (custom header, not a standard Bearer/Token scheme).
export default {
  id: "gladia",
  alias: "gladia",
  display: {
    name: "Gladia",
    icon: "record_voice_over",
    color: "#6425FE",
    textIcon: "GL",
    website: "https://gladia.io",
  },
  category: "apikey",
  authType: "apikey",
  transport: { baseUrl: "https://api.gladia.io/v2/pre-recorded" },
  models: [
    { id: "solaria-1", name: "Solaria 1", kind: "stt" },
    { id: "solaria-mini", name: "Solaria Mini", kind: "stt" },
  ],
  serviceKinds: ["stt"],
  sttConfig: { baseUrl: "https://api.gladia.io/v2/pre-recorded", authType: "apikey", authHeader: "x-gladia-key", format: "gladia" },
};
