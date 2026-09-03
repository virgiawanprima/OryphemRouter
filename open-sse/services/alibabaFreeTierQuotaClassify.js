import { getAlibabaBillingMode } from "./alibabaFreeTier.js";
import {
  getAlibabaBuiltinFreeTierTextCapableModels,
  getAlibabaBuiltinNoFreeTierTextModels
} from "./alibabaFreeTierAllowlist.js";
import { toNumberOrNull } from "../utils/omni/numeric.js";
import {
  isDashscopeAudioModelId,
  isDashscopeMultimodalModelId,
  isDashscopeTextModelId,
  isDashscopeVisionModelId
} from "./dashscopeTextModels.js";
import {
  asRecord,
  getAlibabaFreeTierQuotaLastSyncAt,
  isAlibabaLiveQuotaSyncAt,
  normalizeModelIdList,
  toTrimmedString
} from "./alibabaFreeTierQuotaTypes.js";
function isAlibabaQuotaValidityExpired(entry, nowMs = Date.now()) {
  if (typeof entry.quotaValidityPeriod !== "number" || !Number.isFinite(entry.quotaValidityPeriod)) {
    return false;
  }
  return entry.quotaValidityPeriod < nowMs;
}
function parseQuotaEntry(value) {
  const record = asRecord(value);
  const model = toTrimmedString(record.model);
  if (!model) return null;
  return {
    model,
    freeTierOnly: record.freeTierOnly === true,
    quotaStatus: toTrimmedString(record.quotaStatus) || "UNKNOWN",
    quotaTotal: toNumberOrNull(record.quotaTotal) ?? void 0,
    quotaInitTotal: toNumberOrNull(record.quotaInitTotal) ?? void 0,
    quotaTotalPercentage: toNumberOrNull(record.quotaTotalPercentage) ?? void 0,
    quotaValidityPeriod: toNumberOrNull(record.quotaValidityPeriod) ?? void 0
  };
}
function parseAlibabaFreeTierQuotaEntries(payload) {
  const root = asRecord(payload);
  const dataV2 = asRecord(asRecord(root.data).DataV2 ?? root.DataV2);
  const inner = asRecord(dataV2.data);
  const payloadData = asRecord(inner.data ?? inner);
  const quotas = payloadData.freeTierQuotas;
  if (!Array.isArray(quotas)) return [];
  return quotas.map((entry) => parseQuotaEntry(entry)).filter((entry) => entry !== null);
}
function classifyAlibabaFreeTierQuotaEntry(entry, nowMs = Date.now()) {
  if (isAlibabaQuotaValidityExpired(entry, nowMs)) {
    return "not_capable";
  }
  if (!entry.freeTierOnly) {
    return "not_capable";
  }
  if (entry.quotaStatus === "VALID") {
    if (typeof entry.quotaTotal === "number") {
      return entry.quotaTotal > 0 ? "available" : "drained";
    }
    return "capable_unknown";
  }
  if (entry.quotaStatus === "UNKNOWN") {
    return "capable_unknown";
  }
  return "not_capable";
}
function classifyAlibabaVisionFreeTierQuotaEntry(entry, nowMs = Date.now()) {
  if (isAlibabaQuotaValidityExpired(entry, nowMs)) {
    return "not_capable";
  }
  if (!isDashscopeVisionModelId(entry.model)) {
    return "not_capable";
  }
  if (entry.quotaStatus === "VALID") {
    if (typeof entry.quotaTotal === "number") {
      return entry.quotaTotal > 0 ? "available" : "drained";
    }
    if (typeof entry.quotaInitTotal === "number") {
      return entry.quotaInitTotal > 0 ? "available" : "drained";
    }
    return "not_capable";
  }
  return "not_capable";
}
function classifyAlibabaVisionFreeTierQuotaEntries(entries) {
  return classifyAlibabaFreeTierQuotaEntriesByModelFilter(entries, isDashscopeVisionModelId, {
    useVisionRules: true
  });
}
function classifyAlibabaFreeTierQuotaEntriesByModelFilter(entries, modelFilter, options = {}) {
  const capableModels = [];
  const noFreeTierModels = [];
  const drainedModels = [];
  for (const entry of entries) {
    if (!modelFilter(entry.model)) continue;
    const verdict = options.useVisionRules ? classifyAlibabaVisionFreeTierQuotaEntry(entry) : classifyAlibabaFreeTierQuotaEntry(entry);
    switch (verdict) {
      case "available":
        capableModels.push(entry.model);
        break;
      case "capable_unknown":
        capableModels.push(entry.model);
        break;
      case "drained":
        if (options.useVisionRules) {
          drainedModels.push(entry.model);
        } else {
          capableModels.push(entry.model);
          drainedModels.push(entry.model);
        }
        break;
      case "not_capable":
        noFreeTierModels.push(entry.model);
        break;
      default:
        break;
    }
  }
  return {
    capableModels: [...new Set(capableModels)],
    noFreeTierModels: [...new Set(noFreeTierModels)],
    drainedModels: [...new Set(drainedModels)],
    entries: entries.filter((entry) => modelFilter(entry.model))
  };
}
function classifyAlibabaMultimodalFreeTierQuotaEntries(entries) {
  return classifyAlibabaFreeTierQuotaEntriesByModelFilter(entries, isDashscopeMultimodalModelId);
}
function classifyAlibabaAudioFreeTierQuotaEntries(entries) {
  return classifyAlibabaFreeTierQuotaEntriesByModelFilter(entries, isDashscopeAudioModelId);
}
function classifyAlibabaFreeTierQuotaEntries(entries, options = {}) {
  const capableModels = [];
  const noFreeTierModels = [];
  const drainedModels = [];
  for (const entry of entries) {
    if (options.textOnly && !isDashscopeTextModelId(entry.model)) continue;
    const verdict = classifyAlibabaFreeTierQuotaEntry(entry);
    switch (verdict) {
      case "available":
      case "capable_unknown":
        capableModels.push(entry.model);
        break;
      case "drained":
        capableModels.push(entry.model);
        drainedModels.push(entry.model);
        break;
      case "not_capable":
        noFreeTierModels.push(entry.model);
        break;
      default:
        break;
    }
  }
  return {
    capableModels: [...new Set(capableModels)],
    noFreeTierModels: [...new Set(noFreeTierModels)],
    drainedModels: [...new Set(drainedModels)],
    entries: [...entries]
  };
}
function unionModelIdLists(lists) {
  return [...new Set(lists.flat())];
}
const ALIBABA_SHARED_FREE_TIER_ELIGIBILITY_KEYS = [
  "alibabaFreeTierCapableModels",
  "alibabaNoFreeTierModels",
  "alibabaFreeTierVisionCapableModels",
  "alibabaNoFreeTierVisionModels",
  "alibabaFreeTierMultimodalCapableModels",
  "alibabaNoFreeTierMultimodalModels",
  "alibabaFreeTierAudioCapableModels",
  "alibabaNoFreeTierAudioModels",
  "alibabaFreeTierQuotaEntries",
  "alibabaFreeTierVisionQuotaEntries",
  "alibabaFreeTierMultimodalQuotaEntries",
  "alibabaFreeTierAudioQuotaEntries",
  "alibabaFreeTierQuotaLastSyncAt",
  "alibabaFreeTierDiscoverySource"
];
function extractAlibabaSharedFreeTierEligibility(providerSpecificData) {
  const source = asRecord(providerSpecificData);
  const shared = {};
  for (const key of ALIBABA_SHARED_FREE_TIER_ELIGIBILITY_KEYS) {
    if (source[key] !== void 0) {
      shared[key] = source[key];
    }
  }
  return shared;
}
function applyAlibabaSharedFreeTierEligibility(targetPsd, shared) {
  return { ...targetPsd, ...shared };
}
function pickCanonicalAlibabaFreeTierConnection(connections, fields) {
  const freeConnections = connections.filter(
    (connection) => getAlibabaBillingMode(connection.providerSpecificData) === "free"
  );
  const synced = freeConnections.filter(
    (connection) => Boolean(getAlibabaFreeTierQuotaLastSyncAt(connection.providerSpecificData))
  );
  if (synced.length === 0) return void 0;
  const withEligibility = synced.filter((connection) => {
    const psd = asRecord(connection.providerSpecificData);
    const capable = normalizeModelIdList(psd[fields.capableKey]);
    const blocked = normalizeModelIdList(psd[fields.noFreeTierKey]);
    return capable.length > 0 || blocked.length > 0;
  });
  const pool = withEligibility.length > 0 ? withEligibility : synced;
  return pool.reduce((best, current) => {
    if (!best) return current;
    const bestTime = getAlibabaFreeTierQuotaLastSyncAt(best.providerSpecificData) || "";
    const currentTime = getAlibabaFreeTierQuotaLastSyncAt(current.providerSpecificData) || "";
    return currentTime.localeCompare(bestTime) > 0 ? current : best;
  }, void 0);
}
function resolveAlibabaFreeTierEligibilityLists(connections, fields) {
  const freeConnections = connections.filter(
    (connection) => getAlibabaBillingMode(connection.providerSpecificData) === "free"
  );
  const hasQuotaSync = freeConnections.some(
    (connection) => Boolean(getAlibabaFreeTierQuotaLastSyncAt(connection.providerSpecificData))
  );
  const canonical = pickCanonicalAlibabaFreeTierConnection(freeConnections, fields);
  if (canonical) {
    const psd = asRecord(canonical.providerSpecificData);
    return {
      capable: normalizeModelIdList(psd[fields.capableKey]),
      noFreeTier: normalizeModelIdList(psd[fields.noFreeTierKey]),
      hasQuotaSync,
      quotaSyncAt: getAlibabaFreeTierQuotaLastSyncAt(psd) || "provider-canonical"
    };
  }
  return {
    capable: unionModelIdLists(
      freeConnections.map(
        (connection) => normalizeModelIdList(asRecord(connection.providerSpecificData)[fields.capableKey])
      )
    ),
    noFreeTier: unionModelIdLists(
      freeConnections.map(
        (connection) => normalizeModelIdList(asRecord(connection.providerSpecificData)[fields.noFreeTierKey])
      )
    ),
    hasQuotaSync
  };
}
function buildAlibabaCategoryFilterContext(connections, connectionId, fields) {
  const freeConnections = connections.filter(
    (connection) => getAlibabaBillingMode(connection.providerSpecificData) === "free"
  );
  const target = freeConnections.find((connection) => connection.id === connectionId);
  const targetPsd = asRecord(target?.providerSpecificData);
  const eligibility = resolveAlibabaFreeTierEligibilityLists(freeConnections, fields);
  const merged = {
    alibabaBillingMode: "free",
    [fields.capableKey]: eligibility.capable,
    [fields.noFreeTierKey]: eligibility.noFreeTier,
    [fields.drainedKey]: normalizeModelIdList(targetPsd[fields.drainedKey])
  };
  if (eligibility.hasQuotaSync) {
    merged.alibabaFreeTierQuotaLastSyncAt = eligibility.quotaSyncAt || getAlibabaFreeTierQuotaLastSyncAt(targetPsd) || "provider-merged";
  }
  return merged;
}
function buildAlibabaFreeVisionFilterContext(connections, connectionId) {
  return buildAlibabaCategoryFilterContext(connections, connectionId, {
    capableKey: "alibabaFreeTierVisionCapableModels",
    noFreeTierKey: "alibabaNoFreeTierVisionModels",
    drainedKey: "alibabaFreeTierVisionDrainedModels"
  });
}
function buildAlibabaFreeMultimodalFilterContext(connections, connectionId) {
  return buildAlibabaCategoryFilterContext(connections, connectionId, {
    capableKey: "alibabaFreeTierMultimodalCapableModels",
    noFreeTierKey: "alibabaNoFreeTierMultimodalModels",
    drainedKey: "alibabaFreeTierMultimodalDrainedModels"
  });
}
function buildAlibabaFreeAudioFilterContext(connections, connectionId) {
  return buildAlibabaCategoryFilterContext(connections, connectionId, {
    capableKey: "alibabaFreeTierAudioCapableModels",
    noFreeTierKey: "alibabaNoFreeTierAudioModels",
    drainedKey: "alibabaFreeTierAudioDrainedModels"
  });
}
const ALIBABA_TEXT_ELIGIBILITY_FIELDS = {
  capableKey: "alibabaFreeTierCapableModels",
  noFreeTierKey: "alibabaNoFreeTierModels",
  drainedKey: "alibabaFreeDrainedModels"
};
function buildAlibabaFreeTierTextFilterContext(connections, connectionId) {
  const freeConnections = connections.filter(
    (connection) => getAlibabaBillingMode(connection.providerSpecificData) === "free"
  );
  const target = freeConnections.find((connection) => connection.id === connectionId);
  const targetPsd = asRecord(target?.providerSpecificData);
  const eligibility = resolveAlibabaFreeTierEligibilityLists(
    freeConnections,
    ALIBABA_TEXT_ELIGIBILITY_FIELDS
  );
  const useBuiltinFallback = !eligibility.hasQuotaSync || !isAlibabaLiveQuotaSyncAt(eligibility.quotaSyncAt ?? null);
  const merged = {
    alibabaBillingMode: "free",
    alibabaFreeTierCapableModels: useBuiltinFallback ? unionModelIdLists([eligibility.capable, getAlibabaBuiltinFreeTierTextCapableModels()]) : eligibility.capable,
    alibabaNoFreeTierModels: useBuiltinFallback ? unionModelIdLists([eligibility.noFreeTier, getAlibabaBuiltinNoFreeTierTextModels()]) : eligibility.noFreeTier,
    alibabaFreeDrainedModels: normalizeModelIdList(targetPsd.alibabaFreeDrainedModels)
  };
  const syncAt = eligibility.quotaSyncAt || getAlibabaFreeTierQuotaLastSyncAt(targetPsd) || (useBuiltinFallback ? "builtin-allowlist" : null);
  if (syncAt) {
    merged.alibabaFreeTierQuotaLastSyncAt = syncAt;
  }
  return merged;
}
function getAlibabaFreeTierVisionCapableModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaFreeTierVisionCapableModels);
}
function getAlibabaFreeTierVisionDrainedModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaFreeTierVisionDrainedModels);
}
function getAlibabaNoFreeTierVisionModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaNoFreeTierVisionModels);
}
function isAlibabaFreeTierVisionCapableModel(modelId, providerSpecificData) {
  const noFreeTier = new Set(getAlibabaNoFreeTierVisionModels(providerSpecificData));
  if (noFreeTier.has(modelId)) return false;
  const drained = new Set(getAlibabaFreeTierVisionDrainedModels(providerSpecificData));
  if (drained.has(modelId)) return false;
  const capable = new Set(getAlibabaFreeTierVisionCapableModels(providerSpecificData));
  if (capable.has(modelId)) return true;
  if (getAlibabaFreeTierQuotaLastSyncAt(providerSpecificData)) {
    return false;
  }
  return isDashscopeVisionModelId(modelId);
}
function filterAlibabaFreeVisionEligibleModels(modelIds, providerSpecificData) {
  return filterAlibabaFreeCategoryEligibleModels(
    modelIds,
    providerSpecificData,
    isDashscopeVisionModelId,
    getAlibabaFreeTierVisionCapableModels,
    getAlibabaFreeTierVisionDrainedModels,
    getAlibabaNoFreeTierVisionModels
  );
}
function getAlibabaFreeTierMultimodalCapableModels(providerSpecificData) {
  return normalizeModelIdList(
    asRecord(providerSpecificData).alibabaFreeTierMultimodalCapableModels
  );
}
function getAlibabaFreeTierMultimodalDrainedModels(providerSpecificData) {
  return normalizeModelIdList(
    asRecord(providerSpecificData).alibabaFreeTierMultimodalDrainedModels
  );
}
function getAlibabaNoFreeTierMultimodalModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaNoFreeTierMultimodalModels);
}
function getAlibabaFreeTierAudioCapableModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaFreeTierAudioCapableModels);
}
function getAlibabaFreeTierAudioDrainedModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaFreeTierAudioDrainedModels);
}
function getAlibabaNoFreeTierAudioModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaNoFreeTierAudioModels);
}
function filterAlibabaFreeCategoryEligibleModels(modelIds, providerSpecificData, modelTypeCheck, getCapable, getDrained, getNoFreeTier) {
  const drained = new Set(getDrained(providerSpecificData));
  return modelIds.filter((id) => {
    if (!modelTypeCheck(id)) return false;
    if (drained.has(id)) return false;
    return isAlibabaFreeCategoryCapableModel(
      id,
      providerSpecificData,
      modelTypeCheck,
      getCapable,
      getDrained,
      getNoFreeTier
    );
  });
}
function isAlibabaFreeCategoryCapableModel(modelId, providerSpecificData, modelTypeCheck, getCapable, getDrained, getNoFreeTier) {
  const noFreeTier = new Set(getNoFreeTier(providerSpecificData));
  if (noFreeTier.has(modelId)) return false;
  const drained = new Set(getDrained(providerSpecificData));
  if (drained.has(modelId)) return false;
  const capable = new Set(getCapable(providerSpecificData));
  if (capable.has(modelId)) return true;
  if (getAlibabaFreeTierQuotaLastSyncAt(providerSpecificData)) {
    return false;
  }
  return modelTypeCheck(modelId);
}
function isAlibabaFreeTierMultimodalCapableModel(modelId, providerSpecificData) {
  return isAlibabaFreeCategoryCapableModel(
    modelId,
    providerSpecificData,
    isDashscopeMultimodalModelId,
    getAlibabaFreeTierMultimodalCapableModels,
    getAlibabaFreeTierMultimodalDrainedModels,
    getAlibabaNoFreeTierMultimodalModels
  );
}
function isAlibabaFreeTierAudioCapableModel(modelId, providerSpecificData) {
  return isAlibabaFreeCategoryCapableModel(
    modelId,
    providerSpecificData,
    isDashscopeAudioModelId,
    getAlibabaFreeTierAudioCapableModels,
    getAlibabaFreeTierAudioDrainedModels,
    getAlibabaNoFreeTierAudioModels
  );
}
function filterAlibabaFreeMultimodalEligibleModels(modelIds, providerSpecificData) {
  return filterAlibabaFreeCategoryEligibleModels(
    modelIds,
    providerSpecificData,
    isDashscopeMultimodalModelId,
    getAlibabaFreeTierMultimodalCapableModels,
    getAlibabaFreeTierMultimodalDrainedModels,
    getAlibabaNoFreeTierMultimodalModels
  );
}
function filterAlibabaFreeAudioEligibleModels(modelIds, providerSpecificData) {
  return filterAlibabaFreeCategoryEligibleModels(
    modelIds,
    providerSpecificData,
    isDashscopeAudioModelId,
    getAlibabaFreeTierAudioCapableModels,
    getAlibabaFreeTierAudioDrainedModels,
    getAlibabaNoFreeTierAudioModels
  );
}
export {
  applyAlibabaSharedFreeTierEligibility,
  buildAlibabaFreeAudioFilterContext,
  buildAlibabaFreeMultimodalFilterContext,
  buildAlibabaFreeTierTextFilterContext,
  buildAlibabaFreeVisionFilterContext,
  classifyAlibabaAudioFreeTierQuotaEntries,
  classifyAlibabaFreeTierQuotaEntries,
  classifyAlibabaFreeTierQuotaEntry,
  classifyAlibabaMultimodalFreeTierQuotaEntries,
  classifyAlibabaVisionFreeTierQuotaEntries,
  classifyAlibabaVisionFreeTierQuotaEntry,
  extractAlibabaSharedFreeTierEligibility,
  filterAlibabaFreeAudioEligibleModels,
  filterAlibabaFreeMultimodalEligibleModels,
  filterAlibabaFreeVisionEligibleModels,
  getAlibabaFreeTierVisionCapableModels,
  getAlibabaFreeTierVisionDrainedModels,
  getAlibabaNoFreeTierVisionModels,
  isAlibabaFreeTierAudioCapableModel,
  isAlibabaFreeTierMultimodalCapableModel,
  isAlibabaFreeTierVisionCapableModel,
  isAlibabaQuotaValidityExpired,
  parseAlibabaFreeTierQuotaEntries,
  pickCanonicalAlibabaFreeTierConnection
};
