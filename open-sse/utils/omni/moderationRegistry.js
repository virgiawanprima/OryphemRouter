// ADAPTED STUB (was config/moderationRegistry.ts in OmniRoute). Minimal graceful registry:
// resolves providers listed below; unknown providers fall back gracefully so the
// handler module can load and dispatch. Replace with full port when available.
const PROVIDERS = {
  "openai": {
    "id": "openai",
    "format": "openai-moderation",
    "baseUrl": "https://api.openai.com/v1",
    "models": [
      {
        "id": "omni-moderation-latest"
      }
    ]
  }
};
function normalizeProviderId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function parseModerationModel(modelId) {
  if (typeof modelId !== "string" || !modelId.includes("/")) return { provider: null, model: null };
  const [provider, model] = modelId.split("/");
  return { provider: provider || null, model: model || null };
}
export function getModerationProvider(p) { return PROVIDERS[normalizeProviderId(p)] || null; }
export const MODERATION_PROVIDERS = Object.values(PROVIDERS);
export default PROVIDERS;
