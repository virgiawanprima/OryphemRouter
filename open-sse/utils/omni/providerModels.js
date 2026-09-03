// ADAPTED — extends OryphemRouter config/providerModels.js with getModelTimeoutMs
// (OmniRoute registry model-level timeoutMs override, #6354).
import {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel,
  findModelName,
  getModelTargetFormat,
  getModelSupportedFormats,
  getModelType,
  getModelUpstreamId,
  getModelQuotaFamily,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelStrip,
} from "../../config/providerModels.js";

export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel,
  findModelName,
  getModelTargetFormat,
  getModelSupportedFormats,
  getModelType,
  getModelUpstreamId,
  getModelQuotaFamily,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelStrip,
};

function findProviderModel(aliasOrId, modelId) {
  const models = getProviderModels(aliasOrId);
  if (!Array.isArray(models)) return undefined;
  return models.find((m) => m && (m.id === modelId || m.id === modelId)) || undefined;
}

export function getModelTimeoutMs(aliasOrId, modelId) {
  const model = findProviderModel(aliasOrId, modelId);
  const timeoutMs = model?.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return undefined;
  return Math.max(0, Math.floor(timeoutMs));
}

export function getProviderModel(aliasOrId, modelId) {
  return findProviderModel(aliasOrId, modelId);
}