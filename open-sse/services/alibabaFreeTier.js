import { isModelLocked, lockModel } from "../utils/omni/omniAccountFallbackLocks.js";
const ALIBABA_FREE_DRAINED_LOCK_MS = 10 * 365 * 24 * 60 * 60 * 1e3;
const ALIBABA_FREE_QUOTA_EXHAUSTED_PATTERNS = [
  /\bfree quota has been exhausted\b/i,
  /\bfree tier of the model has been exhausted\b/i,
  /\buse free tier only\b/i
];
const ALIBABA_MODEL_STUDIO_PROVIDER_IDS = /* @__PURE__ */ new Set(["alibaba", "alibaba-cn", "ali"]);
import {
  filterAlibabaFreeEligibleModels,
  isAlibabaFreeTierCapableModel
} from "./alibabaFreeTierDiscovery.js";
import {
  filterAlibabaFreeVisionEligibleModels,
  filterAlibabaFreeMultimodalEligibleModels,
  filterAlibabaFreeAudioEligibleModels,
  isAlibabaFreeTierVisionCapableModel,
  isAlibabaFreeTierMultimodalCapableModel,
  isAlibabaFreeTierAudioCapableModel
} from "./alibabaFreeTierQuotaFetcher.js";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isAlibabaModelStudioProvider(provider) {
  if (!provider) return false;
  const normalized = provider.toLowerCase();
  return ALIBABA_MODEL_STUDIO_PROVIDER_IDS.has(normalized);
}
function isAlibabaFreeQuotaExhaustedError(errorText) {
  const text = String(errorText || "");
  if (!text) return false;
  return ALIBABA_FREE_QUOTA_EXHAUSTED_PATTERNS.some((pattern) => pattern.test(text));
}
function getAlibabaBillingMode(providerSpecificData) {
  const raw = asRecord(providerSpecificData).alibabaBillingMode;
  return raw === "free" ? "free" : "paid";
}
function getAlibabaFreeDrainedModels(providerSpecificData) {
  const raw = asRecord(providerSpecificData).alibabaFreeDrainedModels;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => typeof entry === "string" && entry.length > 0);
}
function isAlibabaModelFreeDrained(provider, providerSpecificData, model) {
  if (!isAlibabaModelStudioProvider(provider) || !model) return false;
  return getAlibabaFreeDrainedModels(providerSpecificData).includes(model);
}
function mergeAlibabaFreeDrainedModels(providerSpecificData, model) {
  const base = asRecord(providerSpecificData);
  const existing = new Set(getAlibabaFreeDrainedModels(base));
  existing.add(model);
  return {
    ...base,
    alibabaFreeDrainedModels: [...existing]
  };
}
function shouldUseLiveAlibabaFreeModelDiscovery(providerSpecificData) {
  return getAlibabaBillingMode(providerSpecificData) === "free";
}
function filterAlibabaFreeTierModels(modelIds, providerSpecificData) {
  const drained = new Set(getAlibabaFreeDrainedModels(providerSpecificData));
  return modelIds.filter((id) => !drained.has(id));
}
function rehydrateAlibabaFreeDrainedModelLocks(provider, connectionId, providerSpecificData) {
  if (!isAlibabaModelStudioProvider(provider) || getAlibabaBillingMode(providerSpecificData) !== "free") {
    return;
  }
  for (const model of getAlibabaFreeDrainedModels(providerSpecificData)) {
    if (!isModelLocked(provider, connectionId, model)) {
      lockModel(
        provider,
        connectionId,
        model,
        "free_quota_exhausted",
        ALIBABA_FREE_DRAINED_LOCK_MS
      );
    }
  }
}
async function isAlibabaFreeTierModelRoutable(provider, connectionId, model) {
  if (!isAlibabaModelStudioProvider(provider) || !model) return true;
  if (isModelLocked(provider, connectionId, model)) return false;
  try {
    const { getProviderConnections } = await import("../utils/omni/dbProviders.js");
    const { buildAlibabaFreeTierFilterContext, isAlibabaFreeTierCapableModel: isAlibabaFreeTierCapableModel2 } = await import("./alibabaFreeTierDiscovery.js");
    const connections = await getProviderConnections({ provider });
    const connection = connections.find((entry) => entry.id === connectionId);
    if (!connection) return true;
    const providerSpecificData = connection.providerSpecificData;
    rehydrateAlibabaFreeDrainedModelLocks(provider, connectionId, providerSpecificData);
    if (getAlibabaBillingMode(providerSpecificData) === "free") {
      const filterContext = buildAlibabaFreeTierFilterContext(
        connections,
        connectionId
      );
      if (!isAlibabaFreeTierCapableModel2(model, filterContext)) return false;
    }
    return !isAlibabaModelFreeDrained(provider, providerSpecificData, model);
  } catch {
    return !isModelLocked(provider, connectionId, model);
  }
}
export {
  ALIBABA_FREE_DRAINED_LOCK_MS,
  filterAlibabaFreeAudioEligibleModels,
  filterAlibabaFreeEligibleModels,
  filterAlibabaFreeMultimodalEligibleModels,
  filterAlibabaFreeTierModels,
  filterAlibabaFreeVisionEligibleModels,
  getAlibabaBillingMode,
  getAlibabaFreeDrainedModels,
  isAlibabaFreeQuotaExhaustedError,
  isAlibabaFreeTierAudioCapableModel,
  isAlibabaFreeTierCapableModel,
  isAlibabaFreeTierModelRoutable,
  isAlibabaFreeTierMultimodalCapableModel,
  isAlibabaFreeTierVisionCapableModel,
  isAlibabaModelFreeDrained,
  isAlibabaModelStudioProvider,
  mergeAlibabaFreeDrainedModels,
  rehydrateAlibabaFreeDrainedModelLocks,
  shouldUseLiveAlibabaFreeModelDiscovery
};
