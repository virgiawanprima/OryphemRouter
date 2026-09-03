import { getProviderModels } from "./omni/providerModelsExtra.js";
const REGISTERED_EFFORT_SUFFIXES = ["none", "low", "medium", "high", "max", "xhigh"];
function getRegisteredProviderEffortBaseModelId(providerId, modelId) {
  const providerModels = getProviderModels(providerId);
  if (!providerModels.some((candidate) => candidate.id === modelId)) {
    return null;
  }
  for (const effort of REGISTERED_EFFORT_SUFFIXES) {
    const suffix = `-${effort}`;
    if (!modelId.endsWith(suffix)) continue;
    const baseModelId = modelId.slice(0, -suffix.length);
    return providerModels.some((candidate) => candidate.id === baseModelId) ? baseModelId : null;
  }
  return null;
}
function isRegisteredProviderEffortVariant(providerId, modelId) {
  return getRegisteredProviderEffortBaseModelId(providerId, modelId) !== null;
}
export {
  getRegisteredProviderEffortBaseModelId,
  isRegisteredProviderEffortVariant
};
