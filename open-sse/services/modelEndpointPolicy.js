const CHAT_ENDPOINTS = /* @__PURE__ */ new Set([
  "chat",
  "chat-completions",
  "chat/completions",
  "messages",
  "responses"
]);
const IMAGE_ENDPOINTS = /* @__PURE__ */ new Set(["image", "images", "images/generations"]);
const VIDEO_ENDPOINTS = /* @__PURE__ */ new Set(["video", "videos", "videos/generations"]);
function normalizeEndpoint(endpoint) {
  return endpoint.trim().toLowerCase().replace(/^\/+/, "").replace(/^v1\//, "");
}
function classifyExplicitEndpoints(supportedEndpoints) {
  if (!supportedEndpoints?.length) return null;
  const endpoints = supportedEndpoints.map(normalizeEndpoint).filter(Boolean);
  if (endpoints.some((endpoint) => CHAT_ENDPOINTS.has(endpoint))) {
    return { kind: "chat", chatSelectable: true, reason: "explicit-endpoints" };
  }
  if (endpoints.some((endpoint) => IMAGE_ENDPOINTS.has(endpoint))) {
    return { kind: "image", chatSelectable: false, reason: "explicit-endpoints" };
  }
  if (endpoints.some((endpoint) => VIDEO_ENDPOINTS.has(endpoint))) {
    return { kind: "video", chatSelectable: false, reason: "explicit-endpoints" };
  }
  return { kind: "non-chat", chatSelectable: false, reason: "explicit-endpoints" };
}
function normalizeOpenAiModelId(modelId) {
  return modelId.startsWith("openai/") ? modelId.slice("openai/".length) : modelId;
}
function classifyOpenAiModel(modelId) {
  const normalized = normalizeOpenAiModelId(modelId).toLowerCase();
  if (normalized.startsWith("gpt-image-") || normalized.startsWith("dall-e-") || normalized === "chatgpt-image-latest") {
    return { kind: "image", chatSelectable: false, reason: "provider-policy" };
  }
  if (normalized.startsWith("sora-")) {
    return { kind: "video", chatSelectable: false, reason: "provider-policy" };
  }
  return null;
}
function getModelEndpointDecision(provider, modelId, supportedEndpoints) {
  const explicit = classifyExplicitEndpoints(supportedEndpoints);
  if (provider?.trim().toLowerCase() === "openai") {
    const openAiDecision = classifyOpenAiModel(modelId);
    if (openAiDecision) {
      const normalizedEndpoints = supportedEndpoints?.map(normalizeEndpoint) ?? [];
      const hasSpecialtyEndpoint = openAiDecision.kind === "image" ? normalizedEndpoints.some((endpoint) => IMAGE_ENDPOINTS.has(endpoint)) : normalizedEndpoints.some((endpoint) => VIDEO_ENDPOINTS.has(endpoint));
      if (explicit?.chatSelectable && hasSpecialtyEndpoint) return explicit;
      return openAiDecision;
    }
  }
  if (explicit) return explicit;
  return { kind: "unknown", chatSelectable: true, reason: "unclassified" };
}
function isChatSelectableModel(provider, model) {
  return getModelEndpointDecision(provider, model.id, model.supportedEndpoints).chatSelectable;
}
function filterChatSelectableModels(provider, models) {
  return models.filter((model) => isChatSelectableModel(provider, model));
}
export {
  filterChatSelectableModels,
  getModelEndpointDecision,
  isChatSelectableModel
};
