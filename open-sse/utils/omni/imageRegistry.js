// ADAPTED STUB (was config/imageRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "openai": {
    "id": "openai",
    "format": "openai-image",
    "baseUrl": "https://api.openai.com/v1",
    "models": [
      {
        "id": "dall-e-3"
      },
      {
        "id": "gpt-image-1"
      }
    ]
  },
  "stability": {
    "id": "stability",
    "format": "stability-image",
    "baseUrl": "https://api.stability.ai",
    "models": [
      {
        "id": "sd3"
      },
      {
        "id": "sd3.5"
      }
    ]
  },
  "fal": {
    "id": "fal",
    "format": "fal-image",
    "baseUrl": "https://queue.fal.run",
    "models": [
      {
        "id": "flux"
      }
    ]
  },
  "gemini": {
    "id": "gemini",
    "format": "gemini-image",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "models": [
      {
        "id": "imagen-3.0"
      }
    ]
  },
  "google": {
    "id": "google",
    "format": "gemini-image",
    "baseUrl": "https://generativelanguage.googleapis.com",
    "models": [
      {
        "id": "imagen-3.0"
      }
    ]
  },
  "adobe-firefly": {
    "id": "adobe-firefly",
    "format": "adobe-firefly-image",
    "baseUrl": "https://firefly-api.adobe.io",
    "models": [
      {
        "id": "firefly"
      }
    ]
  },
  "aihorde": {
    "id": "aihorde",
    "format": "aihorde-image",
    "baseUrl": "https://aihorde.net",
    "models": [
      {
        "id": "stable_diffusion"
      }
    ]
  },
  "alibaba": {
    "id": "alibaba",
    "format": "alibaba-image",
    "baseUrl": "https://dashscope.aliyuncs.com",
    "models": [
      {
        "id": "wanx"
      }
    ]
  },
  "segmind": {
    "id": "segmind",
    "format": "segmind-image",
    "baseUrl": "https://api.segmind.com",
    "models": [
      {
        "id": "sd"
      }
    ]
  },
  "minimax": {
    "id": "minimax",
    "format": "minimax-image",
    "baseUrl": "https://api.minimax.chat",
    "models": [
      {
        "id": "image-01"
      }
    ]
  },
  "nvidia": {
    "id": "nvidia",
    "format": "nvidia-nim-image",
    "baseUrl": "https://ai.api.nvidia.com",
    "models": [
      {
        "id": "sdxl"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseImageModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getImageProvider(provider) {
  return PROVIDERS[normalizeProviderId(provider)] || null;
}
export const IMAGE_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
