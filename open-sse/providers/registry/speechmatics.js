// Speechmatics STT — async batch workflow (POST /v2/jobs: submit multipart job → poll → fetch transcript).
// Auth: Authorization: Bearer <api-key>. Streaming (WebSocket real-time) mode is batch-only here.
export default {
  id: "speechmatics",
  alias: "sm",
  display: {
    name: "Speechmatics",
    icon: "record_voice_over",
    color: "#0A2540",
    textIcon: "SM",
    website: "https://www.speechmatics.com",
  },
  category: "apikey",
  authType: "apikey",
  transport: { baseUrl: "https://asr.api.speechmatics.com/v2/jobs" },
  models: [
    { id: "enhanced", name: "Enhanced", kind: "stt" },
  ],
  serviceKinds: ["stt"],
  sttConfig: { baseUrl: "https://asr.api.speechmatics.com/v2/jobs", authType: "apikey", authHeader: "bearer", format: "speechmatics" },
};
