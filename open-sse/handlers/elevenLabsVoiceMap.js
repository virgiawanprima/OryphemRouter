const OPENAI_VOICE_TO_ELEVENLABS_ID = {
  alloy: "21m00Tcm4TlvDq8ikWAM",
  // Rachel
  echo: "pNInz6obpgDQGcFmaJgB",
  // Adam
  fable: "nPczCjzI2devNBz1zQrb",
  // Brian
  onyx: "ErXwobaYiN019PkySvjV",
  // Antoni
  nova: "EXAVITQu4vr4xnSDxMaL",
  // Bella
  shimmer: "ThT5KcBeYPX3keUQqHPh"
  // Dorothy
};
const ELEVENLABS_DISPLAY_NAME_TO_ID = {
  rachel: "21m00Tcm4TlvDq8ikWAM",
  adam: "pNInz6obpgDQGcFmaJgB",
  brian: "nPczCjzI2devNBz1zQrb",
  antoni: "ErXwobaYiN019PkySvjV",
  bella: "EXAVITQu4vr4xnSDxMaL",
  dorothy: "ThT5KcBeYPX3keUQqHPh"
};
const ELEVENLABS_DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_VOICE_ID_PATTERN = /^[A-Za-z0-9]{16,32}$/;
function resolveElevenLabsVoiceId(voice) {
  if (voice === void 0 || voice === null || voice === "") {
    return ELEVENLABS_DEFAULT_VOICE_ID;
  }
  if (typeof voice !== "string") {
    return null;
  }
  const trimmed = voice.trim();
  if (!trimmed) {
    return ELEVENLABS_DEFAULT_VOICE_ID;
  }
  const lower = trimmed.toLowerCase();
  if (OPENAI_VOICE_TO_ELEVENLABS_ID[lower]) {
    return OPENAI_VOICE_TO_ELEVENLABS_ID[lower];
  }
  if (ELEVENLABS_DISPLAY_NAME_TO_ID[lower]) {
    return ELEVENLABS_DISPLAY_NAME_TO_ID[lower];
  }
  if (ELEVENLABS_VOICE_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return null;
}
export {
  ELEVENLABS_DEFAULT_VOICE_ID,
  resolveElevenLabsVoiceId
};
