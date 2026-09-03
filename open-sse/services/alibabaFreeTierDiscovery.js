import {
  getAlibabaBillingMode,
  getAlibabaFreeDrainedModels,
  isAlibabaFreeQuotaExhaustedError,
  isAlibabaModelStudioProvider,
  mergeAlibabaFreeDrainedModels
} from "./alibabaFreeTier.js";
import {
  getAlibabaBuiltinFreeTierTextCapableModels,
  getAlibabaBuiltinNoFreeTierTextModels
} from "./alibabaFreeTierAllowlist.js";
import {
  buildAlibabaFreeTierTextFilterContext,
  getAlibabaFreeTierQuotaLastSyncAt
} from "./alibabaFreeTierQuotaFetcher.js";
import { log, sanitize } from "../utils/log.js";
const ALIBABA_THIRD_PARTY_PAID_PREFIXES = [/^kimi-/i, /^moonshot-/i];
const ALIBABA_NATIVE_FREE_TIER_PREFIXES = [
  /^qwen/i,
  /^qwq/i,
  /^glm-/i,
  /^deepseek-/i,
  /^minimax-/i,
  /^MiniMax-/i
];
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeModelIdList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => typeof entry === "string" && entry.length > 0);
}
function getAlibabaFreeTierCapableModels(providerSpecificData) {
  const raw = asRecord(providerSpecificData).alibabaFreeTierCapableModels;
  const drained = getAlibabaFreeDrainedModels(providerSpecificData);
  return [.../* @__PURE__ */ new Set([...normalizeModelIdList(raw), ...drained])];
}
function getAlibabaNoFreeTierModels(providerSpecificData) {
  return normalizeModelIdList(asRecord(providerSpecificData).alibabaNoFreeTierModels);
}
function isAlibabaThirdPartyPaidModelFamily(modelId) {
  return ALIBABA_THIRD_PARTY_PAID_PREFIXES.some((pattern) => pattern.test(modelId));
}
function isAlibabaNativeFreeTierModelFamily(modelId) {
  return ALIBABA_NATIVE_FREE_TIER_PREFIXES.some((pattern) => pattern.test(modelId));
}
function parseAlibabaFreeTierProbeError(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const error = parsed?.error;
    const code = String(error?.code || error?.type || "");
    const message = String(error?.message || bodyText || "");
    return { code, message };
  } catch {
    return { code: "", message: bodyText };
  }
}
function classifyAlibabaFreeTierProbe(modelId, status, bodyText) {
  const { code, message } = parseAlibabaFreeTierProbeError(bodyText);
  const combined = `${code} ${message}`;
  if (status >= 200 && status < 300) {
    if (isAlibabaThirdPartyPaidModelFamily(modelId)) {
      return { modelId, verdict: "not_capable", status, errorCode: code || void 0 };
    }
    if (isAlibabaNativeFreeTierModelFamily(modelId)) {
      return { modelId, verdict: "capable_available", status, errorCode: code || void 0 };
    }
    return { modelId, verdict: "unknown", status, errorCode: code || void 0 };
  }
  if (status === 403 && (code === "AllocationQuota.FreeTierOnly" || isAlibabaFreeQuotaExhaustedError(combined))) {
    return { modelId, verdict: "capable_drained", status, errorCode: code || void 0 };
  }
  if (status === 403 || status === 400) {
    return { modelId, verdict: "not_capable", status, errorCode: code || void 0 };
  }
  return { modelId, verdict: "unknown", status, errorCode: code || void 0 };
}
function mergeAlibabaFreeTierProbeResults(providerSpecificData, results, billingMode = getAlibabaBillingMode(providerSpecificData)) {
  const base = asRecord(providerSpecificData);
  const capable = new Set(getAlibabaFreeTierCapableModels(base));
  const noFreeTier = new Set(getAlibabaNoFreeTierModels(base));
  let next = base;
  for (const result of results) {
    switch (result.verdict) {
      case "capable_available":
        capable.add(result.modelId);
        noFreeTier.delete(result.modelId);
        break;
      case "capable_drained":
        capable.add(result.modelId);
        noFreeTier.delete(result.modelId);
        if (billingMode === "free") {
          next = mergeAlibabaFreeDrainedModels(next, result.modelId);
        }
        break;
      case "not_capable":
        noFreeTier.add(result.modelId);
        capable.delete(result.modelId);
        break;
      default:
        break;
    }
  }
  return {
    ...next,
    alibabaFreeTierCapableModels: [...capable],
    alibabaNoFreeTierModels: [...noFreeTier],
    alibabaFreeTierProbeLastRunAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function buildAlibabaFreeTierFilterContext(connections, connectionId) {
  return buildAlibabaFreeTierTextFilterContext(connections, connectionId);
}
function isAlibabaFreeTierCapableModel(modelId, providerSpecificData, options = {}) {
  const noFreeTier = /* @__PURE__ */ new Set([
    ...getAlibabaNoFreeTierModels(providerSpecificData),
    ...getAlibabaBuiltinNoFreeTierTextModels()
  ]);
  if (noFreeTier.has(modelId)) return false;
  const drained = new Set(getAlibabaFreeDrainedModels(providerSpecificData));
  if (drained.has(modelId)) return false;
  const capable = /* @__PURE__ */ new Set([
    ...normalizeModelIdList(asRecord(providerSpecificData).alibabaFreeTierCapableModels),
    ...getAlibabaBuiltinFreeTierTextCapableModels()
  ]);
  if (capable.has(modelId)) return true;
  if (getAlibabaFreeTierQuotaLastSyncAt(providerSpecificData) || options.strictAllowlist) {
    return false;
  }
  if (isAlibabaNativeFreeTierModelFamily(modelId) && !isAlibabaThirdPartyPaidModelFamily(modelId)) {
    return true;
  }
  return false;
}
function filterAlibabaFreeEligibleModels(modelIds, providerSpecificData, options = {}) {
  const drained = new Set(getAlibabaFreeDrainedModels(providerSpecificData));
  return modelIds.filter((id) => {
    if (drained.has(id)) return false;
    return isAlibabaFreeTierCapableModel(id, providerSpecificData, options);
  });
}
async function probeAlibabaFreeTierModel(connection, modelId, chatCompletionsUrl) {
  if (!connection.apiKey) {
    return { modelId, verdict: "unknown", status: 0 };
  }
  try {
    const response = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      })
    });
    const bodyText = await response.text();
    return classifyAlibabaFreeTierProbe(modelId, response.status, bodyText);
  } catch {
    return { modelId, verdict: "unknown", status: 0 };
  }
}
async function probeAlibabaFreeTierModels(connection, modelIds, chatCompletionsUrl, options = {}) {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const results = [];
  let index = 0;
  async function worker() {
    while (index < modelIds.length) {
      const current = modelIds[index];
      index += 1;
      results.push(await probeAlibabaFreeTierModel(connection, current, chatCompletionsUrl));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, modelIds.length) }, () => worker()));
  return results;
}
async function refreshAlibabaFreeTierModelClassification(provider, connection, modelIds, chatCompletionsUrl) {
  if (!isAlibabaModelStudioProvider(provider) || getAlibabaBillingMode(connection.providerSpecificData) !== "free") {
    return null;
  }
  if (getAlibabaFreeTierQuotaLastSyncAt(connection.providerSpecificData)) {
    return null;
  }
  const capable = new Set(getAlibabaFreeTierCapableModels(connection.providerSpecificData));
  const noFreeTier = new Set(getAlibabaNoFreeTierModels(connection.providerSpecificData));
  const pending = modelIds.filter((id) => !capable.has(id) && !noFreeTier.has(id));
  if (pending.length === 0) return null;
  const probeResults = await probeAlibabaFreeTierModels(connection, pending, chatCompletionsUrl, {
    concurrency: 4
  });
  return mergeAlibabaFreeTierProbeResults(connection.providerSpecificData, probeResults);
}
function scheduleAlibabaFreeTierProbeRefresh(provider, connection, models, chatCompletionsUrl) {
  const modelIds = models.map((model) => typeof model?.id === "string" ? model.id.trim() : "").filter((id) => id.length > 0);
  if (modelIds.length === 0) return;
  void (async () => {
    try {
      const merged = await refreshAlibabaFreeTierModelClassification(
        provider,
        connection,
        modelIds,
        chatCompletionsUrl
      );
      if (!merged) return;
      const { updateProviderConnection } = await import("../utils/omni/dbProviders.js");
      await updateProviderConnection(connection.id, { providerSpecificData: merged });
    } catch (error) {
      log.warn("ALIBABA-FREE-TIER", "[alibaba-free-tier] background probe refresh failed", {
        connectionId: connection.id,
        error: sanitize(error instanceof Error ? error.message : String(error))
      });
    }
  })();
}
export {
  buildAlibabaFreeTierFilterContext,
  classifyAlibabaFreeTierProbe,
  filterAlibabaFreeEligibleModels,
  getAlibabaFreeTierCapableModels,
  getAlibabaNoFreeTierModels,
  isAlibabaFreeTierCapableModel,
  isAlibabaNativeFreeTierModelFamily,
  isAlibabaThirdPartyPaidModelFamily,
  mergeAlibabaFreeTierProbeResults,
  parseAlibabaFreeTierProbeError,
  probeAlibabaFreeTierModel,
  probeAlibabaFreeTierModels,
  refreshAlibabaFreeTierModelClassification,
  scheduleAlibabaFreeTierProbeRefresh
};
