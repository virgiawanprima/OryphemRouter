// Rev AI STT — async batch transcription (submit job → poll → fetch transcript).
export default {
  id: "rev-ai",
  alias: "revai",
  display: {
    name: "Rev AI",
    icon: "record_voice_over",
    color: "#FF5C35",
    textIcon: "RV",
    website: "https://www.rev.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: { baseUrl: "https://api.rev.ai/speechtotext/v1" },
  models: [
    { id: "machine", name: "Reverb ASR", kind: "stt" },
    { id: "low_cost", name: "Low-Cost ASR", kind: "stt" },
    { id: "fusion", name: "Fusion ASR", kind: "stt" },
  ],
  serviceKinds: ["stt"],
  sttConfig: { baseUrl: "https://api.rev.ai/speechtotext/v1", authType: "apikey", authHeader: "bearer", format: "rev-ai" },
};
