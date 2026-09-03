// ADAPTED STUB (was config/musicRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "fal": {
    "id": "fal",
    "format": "fal-music",
    "baseUrl": "https://queue.fal.run",
    "models": [
      {
        "id": "minimax-music"
      },
      {
        "id": "udiosongs"
      }
    ]
  },
  "minimax": {
    "id": "minimax",
    "format": "minimax-music",
    "baseUrl": "https://api.minimax.chat",
    "models": [
      {
        "id": "music"
      }
    ]
  },
  "suno": {
    "id": "suno",
    "format": "suno-music",
    "baseUrl": "https://api.suno.ai",
    "models": [
      {
        "id": "music"
      }
    ]
  },
  "udio": {
    "id": "udio",
    "format": "udio-music",
    "baseUrl": "https://api.udio.ai",
    "models": [
      {
        "id": "music"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseMusicModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getMusicProvider(provider) {
  return PROVIDERS[normalizeProviderId(provider)] || null;
}
export const MUSIC_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
