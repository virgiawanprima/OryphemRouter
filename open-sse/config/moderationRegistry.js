const MODERATION_PROVIDERS = {
  openai: {
    id: "openai",
    baseUrl: "https://api.openai.com/v1/moderations",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      { id: "omni-moderation-latest", name: "Omni Moderation Latest" },
      { id: "text-moderation-latest", name: "Text Moderation Latest" }
    ]
  },
  mistral: {
    id: "mistral",
    baseUrl: "https://api.mistral.ai/v1/moderations",
    authType: "apikey",
    authHeader: "bearer",
    models: [{ id: "mistral-moderation-latest", name: "Mistral Moderation" }]
  }
};
function getModerationProvider(providerId) {
  return MODERATION_PROVIDERS[providerId] || null;
}
function parseModerationModel(modelStr) {
  if (!modelStr) return { provider: null, model: null };
  for (const providerId of Object.keys(MODERATION_PROVIDERS)) {
    if (modelStr.startsWith(providerId + "/")) {
      return { provider: providerId, model: modelStr.slice(providerId.length + 1) };
    }
  }
  for (const [providerId, config] of Object.entries(MODERATION_PROVIDERS)) {
    if (config.models.some((m) => m.id === modelStr)) {
      return { provider: providerId, model: modelStr };
    }
  }
  return { provider: null, model: modelStr };
}
function getAllModerationModels() {
  const models = [];
  for (const [providerId, config] of Object.entries(MODERATION_PROVIDERS)) {
    for (const model of config.models) {
      models.push({
        id: `${providerId}/${model.id}`,
        name: model.name,
        provider: providerId
      });
    }
  }
  return models;
}
export {
  MODERATION_PROVIDERS,
  getAllModerationModels,
  getModerationProvider,
  parseModerationModel
};
