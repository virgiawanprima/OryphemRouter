import { parseModelFromRegistry, getAllModelsFromRegistry } from "./registryUtils.js";
const MUSIC_PROVIDERS = {
  vertex: {
    id: "vertex",
    baseUrl: "https://us-central1-aiplatform.googleapis.com/v1",
    authType: "apikey",
    authHeader: "bearer",
    format: "vertex-lyria",
    models: [{ id: "lyria-002", name: "Lyria 2 (Vertex)" }]
  },
  "fal-ai": {
    id: "fal-ai",
    baseUrl: "https://queue.fal.run",
    authType: "apikey",
    authHeader: "key",
    format: "fal-ai-music",
    models: [{ id: "ace-step", name: "ACE-Step" }]
  },
  kie: {
    id: "kie",
    baseUrl: "https://api.kie.ai",
    statusUrl: "https://api.kie.ai/api/v1/jobs/recordInfo",
    authType: "apikey",
    authHeader: "bearer",
    format: "kie-music",
    models: [
      { id: "suno-v4.0", name: "Suno V4.0" },
      { id: "suno-v3.5", name: "Suno V3.5" }
    ]
  },
  suno: {
    id: "suno",
    baseUrl: "https://studio-api.suno.ai/api/generate/v2/",
    statusUrl: "https://studio-api.suno.ai/api/feed/",
    authType: "cookie",
    authHeader: "cookie",
    format: "suno-music",
    models: [
      { id: "chirp-v3-5", name: "Chirp V3.5" },
      { id: "chirp-v4", name: "Chirp V4" }
    ]
  },
  udio: {
    id: "udio",
    baseUrl: "https://www.udio.com/api/generate-proxy",
    statusUrl: "https://www.udio.com/api/songs",
    authType: "cookie",
    authHeader: "cookie",
    format: "udio-music",
    models: [{ id: "udio-default", name: "Udio Default" }]
  },
  minimax: {
    id: "minimax",
    baseUrl: "https://api.minimax.io/v1/music_generation",
    // The music operation answers with the finished audio in the POST response —
    // there is no task id and no query endpoint, hence no statusUrl. The regional
    // deployment serves the same contract and is the only host that accepts the
    // `aigc_watermark` request field.
    regionalBaseUrl: "https://api.minimaxi.com/v1/music_generation",
    authType: "apikey",
    authHeader: "bearer",
    format: "minimax-music",
    models: [
      { id: "music-3.0", name: "Music 3.0" },
      { id: "music-2.6", name: "Music 2.6" },
      { id: "music-3.0-free", name: "Music 3.0 Free" },
      { id: "music-2.6-free", name: "Music 2.6 Free" },
      { id: "music-cover", name: "Music Cover" },
      { id: "music-cover-free", name: "Music Cover Free" }
    ]
  },
  comfyui: {
    id: "comfyui",
    baseUrl: "http://localhost:8188",
    authType: "none",
    authHeader: "none",
    format: "comfyui",
    models: [
      { id: "stable-audio-open", name: "Stable Audio Open" },
      { id: "musicgen-medium", name: "MusicGen Medium" }
    ]
  }
};
function getMusicProvider(providerId) {
  return MUSIC_PROVIDERS[providerId] || null;
}
function parseMusicModel(modelStr) {
  return parseModelFromRegistry(modelStr, MUSIC_PROVIDERS);
}
function getAllMusicModels() {
  return getAllModelsFromRegistry(MUSIC_PROVIDERS);
}
export {
  MUSIC_PROVIDERS,
  getAllMusicModels,
  getMusicProvider,
  parseMusicModel
};
