// ADAPTED STUB (was config/audioRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "openai": {
    "id": "openai",
    "format": "openai-tts",
    "baseUrl": "https://api.openai.com/v1",
    "models": [
      {
        "id": "tts-1"
      },
      {
        "id": "gpt-4o-mini-tts"
      }
    ]
  },
  "elevenlabs": {
    "id": "elevenlabs",
    "format": "elevenlabs-tts",
    "baseUrl": "https://api.elevenlabs.io",
    "models": [
      {
        "id": "eleven_multilingual_v2"
      }
    ]
  },
  "gemini": {
    "id": "gemini",
    "format": "gemini-tts",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "models": [
      {
        "id": "gemini-tts"
      }
    ]
  },
  "google": {
    "id": "google",
    "format": "google-tts",
    "baseUrl": "https://texttospeech.googleapis.com",
    "models": [
      {
        "id": "standard"
      }
    ]
  },
  "edge": {
    "id": "edge",
    "format": "edge-tts",
    "baseUrl": "https://speech.platform.bing.com",
    "models": [
      {
        "id": "en-US-AriaNeural"
      }
    ]
  },
  "aws": {
    "id": "aws",
    "format": "aws-polly-tts",
    "baseUrl": "https://polly.us-east-1.amazonaws.com",
    "models": [
      {
        "id": "polly"
      }
    ]
  },
  "gtts": {
    "id": "gtts",
    "format": "gtts-tts",
    "baseUrl": "https://translate.google.com",
    "models": [
      {
        "id": "gtts"
      }
    ]
  },
  "minimax": {
    "id": "minimax",
    "format": "minimax-tts",
    "baseUrl": "https://api.minimax.chat",
    "models": [
      {
        "id": "speech"
      }
    ]
  },
  "openrouter": {
    "id": "openrouter",
    "format": "openrouter-tts",
    "baseUrl": "https://openrouter.ai/api/v1",
    "models": [
      {
        "id": "tts"
      }
    ]
  },
  "xiaomi": {
    "id": "xiaomi",
    "format": "xiaomi-tts",
    "baseUrl": "https://api.xiaomi.com",
    "models": [
      {
        "id": "mimo-tts"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function parseAudioModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function parseSpeechModel(m) { return parseAudioModel(m); }
export function parseTranscriptionModel(m) { return parseAudioModel(m); }
export function parseTranslationModel(m) { return parseAudioModel(m); }
export function getSpeechProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export function getTranscriptionProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export function getTranslationProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export const AUDIO_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
