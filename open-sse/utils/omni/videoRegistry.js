// ADAPTED STUB (was config/videoRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "fal": {
    "id": "fal",
    "format": "fal-video",
    "baseUrl": "https://queue.fal.run",
    "models": [
      {
        "id": "kling-video"
      },
      {
        "id": "veo3"
      }
    ]
  },
  "dashscope": {
    "id": "dashscope",
    "format": "dashscope-video",
    "baseUrl": "https://dashscope.aliyuncs.com",
    "models": [
      {
        "id": "wanx2.1"
      }
    ]
  },
  "deepinfra": {
    "id": "deepinfra",
    "format": "deepinfra-video",
    "baseUrl": "https://api.deepinfra.com",
    "models": [
      {
        "id": "video"
      }
    ]
  },
  "google": {
    "id": "google",
    "format": "google-flow-video",
    "baseUrl": "https://aisandbox-pa.googleapis.com",
    "models": [
      {
        "id": "veo3"
      }
    ]
  },
  "leonardo": {
    "id": "leonardo",
    "format": "leonardo-video",
    "baseUrl": "https://cloud.leonardo.ai",
    "models": [
      {
        "id": "video"
      }
    ]
  },
  "novita": {
    "id": "novita",
    "format": "novita-video",
    "baseUrl": "https://api.novita.ai",
    "models": [
      {
        "id": "video"
      }
    ]
  },
  "openai": {
    "id": "openai",
    "format": "openai-video",
    "baseUrl": "https://api.openai.com/v1",
    "models": [
      {
        "id": "sora-2"
      }
    ]
  },
  "runway": {
    "id": "runway",
    "format": "runway-video",
    "baseUrl": "https://api.dev.runwayml.com/v1",
    "models": [
      {
        "id": "gen3a"
      },
      {
        "id": "gen4"
      }
    ]
  },
  "segmind": {
    "id": "segmind",
    "format": "segmind-video",
    "baseUrl": "https://api.segmind.com",
    "models": [
      {
        "id": "video"
      }
    ]
  },
  "xai": {
    "id": "xai",
    "format": "xai-video",
    "baseUrl": "https://api.x.ai",
    "models": [
      {
        "id": "grok-imagine-video"
      }
    ]
  },
  "adobe": {
    "id": "adobe",
    "format": "adobe-firefly-video",
    "baseUrl": "https://firefly-api.adobe.io",
    "models": [
      {
        "id": "firefly-video"
      }
    ]
  },
  "vertex": {
    "id": "vertex",
    "format": "vertex-video",
    "baseUrl": "https://us-central1-aiplatform.googleapis.com",
    "models": [
      {
        "id": "veo3"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseVideoModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getVideoProvider(provider) {
  return PROVIDERS[normalizeProviderId(provider)] || null;
}
export const VIDEO_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
