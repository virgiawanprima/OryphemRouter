import { getAlibabaBillingMode, isAlibabaModelStudioProvider } from "./alibabaFreeTier.js";
import {
  asRecord,
  normalizeModelIdList,
  toTrimmedString
} from "./alibabaFreeTierQuotaTypes.js";
import {
  applyAlibabaSharedFreeTierEligibility,
  classifyAlibabaAudioFreeTierQuotaEntries,
  classifyAlibabaFreeTierQuotaEntries,
  classifyAlibabaMultimodalFreeTierQuotaEntries,
  classifyAlibabaVisionFreeTierQuotaEntries,
  extractAlibabaSharedFreeTierEligibility,
  parseAlibabaFreeTierQuotaEntries
} from "./alibabaFreeTierQuotaClassify.js";
import { getAlibabaFreeTierQuotaLastSyncAt as getAlibabaFreeTierQuotaLastSyncAt2, isAlibabaLiveQuotaSyncAt } from "./alibabaFreeTierQuotaTypes.js";
import {
  isAlibabaQuotaValidityExpired,
  parseAlibabaFreeTierQuotaEntries as parseAlibabaFreeTierQuotaEntries2,
  classifyAlibabaFreeTierQuotaEntry,
  classifyAlibabaVisionFreeTierQuotaEntry,
  classifyAlibabaVisionFreeTierQuotaEntries as classifyAlibabaVisionFreeTierQuotaEntries2,
  classifyAlibabaMultimodalFreeTierQuotaEntries as classifyAlibabaMultimodalFreeTierQuotaEntries2,
  classifyAlibabaAudioFreeTierQuotaEntries as classifyAlibabaAudioFreeTierQuotaEntries2,
  classifyAlibabaFreeTierQuotaEntries as classifyAlibabaFreeTierQuotaEntries2,
  extractAlibabaSharedFreeTierEligibility as extractAlibabaSharedFreeTierEligibility2,
  applyAlibabaSharedFreeTierEligibility as applyAlibabaSharedFreeTierEligibility2,
  pickCanonicalAlibabaFreeTierConnection,
  buildAlibabaFreeVisionFilterContext,
  buildAlibabaFreeMultimodalFilterContext,
  buildAlibabaFreeAudioFilterContext,
  buildAlibabaFreeTierTextFilterContext,
  getAlibabaFreeTierVisionCapableModels,
  getAlibabaFreeTierVisionDrainedModels,
  getAlibabaNoFreeTierVisionModels,
  isAlibabaFreeTierVisionCapableModel,
  filterAlibabaFreeVisionEligibleModels,
  isAlibabaFreeTierMultimodalCapableModel,
  isAlibabaFreeTierAudioCapableModel,
  filterAlibabaFreeMultimodalEligibleModels,
  filterAlibabaFreeAudioEligibleModels
} from "./alibabaFreeTierQuotaClassify.js";
import { log, sanitize } from "../utils/log.js";
const FREE_TIER_QUOTA_API = "zeldaEasy.bailian-commerce.freeTrial.queryFreeTierQuotaAsyn";
const FREE_TIER_QUOTA_START_API = "zeldaEasy.bailian-commerce.freeTrial.queryFreeTierQuota";
const DEFAULT_TEXT_FE_PATH = "/costing-balance/free-quota";
const DEFAULT_VISION_FE_PATH = process.env.ALIBABA_FREE_TIER_VISION_FE_PATH?.trim() || "/costing-balance/free-quota-image-video";
const DEFAULT_MULTIMODAL_FE_PATH = process.env.ALIBABA_FREE_TIER_MULTIMODAL_FE_PATH?.trim() || "/costing-balance/free-quota-multimodal";
const DEFAULT_AUDIO_FE_PATH = process.env.ALIBABA_FREE_TIER_AUDIO_FE_PATH?.trim() || "/costing-balance/free-quota-audio";
const CONSOLE_GATEWAYS = {
  "global-sg": {
    host: "https://bailian-singapore-cs.alibabacloud.com",
    region: "ap-southeast-1",
    action: "IntlBroadScopeAspnGateway",
    product: "sfm_bailian"
  },
  "china-beijing": {
    host: "https://bailian.console.aliyun.com",
    region: "cn-beijing",
    action: "BroadScopeAspnGateway",
    product: "sfm_bailian"
  }
};
function resolveAlibabaConsoleRegion(providerSpecificData) {
  const region = toTrimmedString(asRecord(providerSpecificData).region);
  return region === "china-beijing" ? "china-beijing" : "global-sg";
}
function normalizeAlibabaConsoleCookie(raw) {
  const value = toTrimmedString(raw);
  if (!value) return null;
  if (/login_aliyunid_ticket=/i.test(value) || value.includes(";")) {
    return value;
  }
  return `login_aliyunid_ticket=${value}`;
}
function getAlibabaConsoleCookie(providerSpecificData) {
  const psd = asRecord(providerSpecificData);
  return normalizeAlibabaConsoleCookie(psd.alibabaConsoleCookie) || normalizeAlibabaConsoleCookie(psd.cookie) || null;
}
function getAlibabaConsoleSecToken(providerSpecificData) {
  return toTrimmedString(asRecord(providerSpecificData).alibabaConsoleSecToken);
}
function hasAlibabaConsoleFreeTierAuth(providerSpecificData) {
  return getAlibabaConsoleCookie(providerSpecificData) !== null;
}
function mergeAlibabaFreeTierQuotaClassification(providerSpecificData, snapshot) {
  const base = asRecord(providerSpecificData);
  const coalesceList = (snapshotList, existingKey) => snapshotList.length > 0 ? [...snapshotList] : normalizeModelIdList(base[existingKey]);
  return {
    ...base,
    alibabaFreeTierCapableModels: coalesceList(
      snapshot.text.capableModels,
      "alibabaFreeTierCapableModels"
    ),
    alibabaNoFreeTierModels: coalesceList(
      snapshot.text.noFreeTierModels,
      "alibabaNoFreeTierModels"
    ),
    alibabaFreeDrainedModels: coalesceList(snapshot.text.drainedModels, "alibabaFreeDrainedModels"),
    alibabaFreeTierVisionCapableModels: coalesceList(
      snapshot.vision.capableModels,
      "alibabaFreeTierVisionCapableModels"
    ),
    alibabaNoFreeTierVisionModels: coalesceList(
      snapshot.vision.noFreeTierModels,
      "alibabaNoFreeTierVisionModels"
    ),
    alibabaFreeTierVisionDrainedModels: coalesceList(
      snapshot.vision.drainedModels,
      "alibabaFreeTierVisionDrainedModels"
    ),
    alibabaFreeTierMultimodalCapableModels: coalesceList(
      snapshot.multimodal.capableModels,
      "alibabaFreeTierMultimodalCapableModels"
    ),
    alibabaNoFreeTierMultimodalModels: coalesceList(
      snapshot.multimodal.noFreeTierModels,
      "alibabaNoFreeTierMultimodalModels"
    ),
    alibabaFreeTierMultimodalDrainedModels: coalesceList(
      snapshot.multimodal.drainedModels,
      "alibabaFreeTierMultimodalDrainedModels"
    ),
    alibabaFreeTierAudioCapableModels: coalesceList(
      snapshot.audio.capableModels,
      "alibabaFreeTierAudioCapableModels"
    ),
    alibabaNoFreeTierAudioModels: coalesceList(
      snapshot.audio.noFreeTierModels,
      "alibabaNoFreeTierAudioModels"
    ),
    alibabaFreeTierAudioDrainedModels: coalesceList(
      snapshot.audio.drainedModels,
      "alibabaFreeTierAudioDrainedModels"
    ),
    alibabaFreeTierQuotaEntries: snapshot.entries,
    alibabaFreeTierVisionQuotaEntries: snapshot.vision.entries,
    alibabaFreeTierMultimodalQuotaEntries: snapshot.multimodal.entries,
    alibabaFreeTierAudioQuotaEntries: snapshot.audio.entries,
    alibabaFreeTierQuotaLastSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
    alibabaFreeTierDiscoverySource: "console-quota-api"
  };
}
async function propagateAlibabaFreeTierEligibilityToSiblings(provider, sourceConnectionId, mergedPsd) {
  const shared = extractAlibabaSharedFreeTierEligibility(mergedPsd);
  if (!shared.alibabaFreeTierQuotaLastSyncAt) return;
  const { getProviderConnections, updateProviderConnection } = await import("../utils/omni/dbProviders.js");
  const connections = await getProviderConnections({ provider });
  for (const connection of connections) {
    if (connection.id === sourceConnectionId) continue;
    const psd = connection.providerSpecificData;
    if (getAlibabaBillingMode(psd) !== "free") continue;
    const updated = applyAlibabaSharedFreeTierEligibility(
      asRecord(connection.providerSpecificData),
      shared
    );
    await updateProviderConnection(connection.id, { providerSpecificData: updated });
  }
}
function buildGatewayUrl(region, api) {
  const gateway = CONSOLE_GATEWAYS[region];
  const params = new URLSearchParams({
    action: gateway.action,
    product: gateway.product,
    api,
    _v: "undefined"
  });
  return `${gateway.host}/data/api.json?${params.toString()}`;
}
function buildCornerstoneParam(region, fePath = DEFAULT_TEXT_FE_PATH) {
  const gateway = CONSOLE_GATEWAYS[region];
  const normalizedPath = fePath.startsWith("/") ? fePath : `/${fePath}`;
  return {
    feTraceId: crypto.randomUUID(),
    feURL: `https://modelstudio.console.alibabacloud.com/${gateway.region}?tab=costing-balance#${normalizedPath}`,
    protocol: "V2",
    console: "ONE_CONSOLE",
    productCode: "p_efm",
    switchAgent: 416572,
    switchUserType: 3,
    domain: "modelstudio.console.alibabacloud.com",
    consoleSite: "MODELSTUDIO_ALBABACLOUD",
    userNickName: "",
    userPrincipalName: "",
    xsp_lang: "en-US"
  };
}
function buildRequestBody(region, api, taskId, fePath = DEFAULT_TEXT_FE_PATH) {
  const gateway = CONSOLE_GATEWAYS[region];
  const request = {};
  if (taskId) {
    request.queryFreeTierQuotaRequest = { taskId };
  } else {
    request.queryFreeTierQuotaRequest = {};
  }
  request.cornerstoneParam = buildCornerstoneParam(region, fePath);
  const body = new URLSearchParams({
    params: JSON.stringify({
      Api: api,
      V: "1.0",
      Data: request
    }),
    region: gateway.region
  });
  return body;
}
async function postConsoleFreeTierQuota(region, api, cookie, secToken, taskId, fePath = DEFAULT_TEXT_FE_PATH) {
  const body = buildRequestBody(region, api, taskId, fePath);
  if (secToken) {
    body.set("sec_token", secToken);
  }
  const response = await fetch(buildGatewayUrl(region, api), {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Origin: "https://modelstudio.console.alibabacloud.com",
      Referer: "https://modelstudio.console.alibabacloud.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15e3)
  });
  return response.json();
}
function extractTaskId(payload) {
  const root = asRecord(payload);
  const dataV2 = asRecord(asRecord(root.data).DataV2 ?? root.DataV2);
  const inner = asRecord(dataV2.data);
  const payloadData = asRecord(inner.data ?? inner);
  return toTrimmedString(payloadData.taskId);
}
function hasQuotaPayload(payload) {
  return parseAlibabaFreeTierQuotaEntries(payload).length > 0;
}
async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchAlibabaFreeTierQuotaEntriesForPath(providerSpecificData, fePath) {
  const cookie = getAlibabaConsoleCookie(providerSpecificData);
  if (!cookie) return null;
  const region = resolveAlibabaConsoleRegion(providerSpecificData);
  const secToken = getAlibabaConsoleSecToken(providerSpecificData);
  let payload = await postConsoleFreeTierQuota(
    region,
    FREE_TIER_QUOTA_START_API,
    cookie,
    secToken,
    null,
    fePath
  );
  if (!hasQuotaPayload(payload)) {
    payload = await postConsoleFreeTierQuota(
      region,
      FREE_TIER_QUOTA_API,
      cookie,
      secToken,
      null,
      fePath
    );
  }
  if (!hasQuotaPayload(payload)) {
    const taskId = extractTaskId(payload);
    if (!taskId) return null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) {
        await delay(400);
      }
      payload = await postConsoleFreeTierQuota(
        region,
        FREE_TIER_QUOTA_API,
        cookie,
        secToken,
        taskId,
        fePath
      );
      if (hasQuotaPayload(payload)) break;
    }
  }
  const entries = parseAlibabaFreeTierQuotaEntries(payload);
  return entries.length > 0 ? entries : null;
}
async function fetchAlibabaFreeTierQuotaEntries(providerSpecificData) {
  return fetchAlibabaFreeTierQuotaEntriesForPath(providerSpecificData, DEFAULT_TEXT_FE_PATH);
}
async function fetchAlibabaFreeTierVisionQuotaEntries(providerSpecificData) {
  return fetchAlibabaFreeTierQuotaEntriesForPath(providerSpecificData, DEFAULT_VISION_FE_PATH);
}
async function fetchAlibabaFreeTierMultimodalQuotaEntries(providerSpecificData) {
  return fetchAlibabaFreeTierQuotaEntriesForPath(providerSpecificData, DEFAULT_MULTIMODAL_FE_PATH);
}
async function fetchAlibabaFreeTierAudioQuotaEntries(providerSpecificData) {
  return fetchAlibabaFreeTierQuotaEntriesForPath(providerSpecificData, DEFAULT_AUDIO_FE_PATH);
}
function mergeUniqueQuotaEntries(...entryGroups) {
  const merged = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of entryGroups) {
    for (const entry of group) {
      if (seen.has(entry.model)) continue;
      seen.add(entry.model);
      merged.push(entry);
    }
  }
  return merged;
}
async function buildAlibabaFreeTierQuotaSnapshot(providerSpecificData) {
  const textEntries = await fetchAlibabaFreeTierQuotaEntries(providerSpecificData);
  if (!textEntries) return null;
  const visionEntries = await fetchAlibabaFreeTierVisionQuotaEntries(providerSpecificData) || textEntries;
  const multimodalEntries = await fetchAlibabaFreeTierMultimodalQuotaEntries(providerSpecificData) || textEntries;
  const audioEntries = await fetchAlibabaFreeTierAudioQuotaEntries(providerSpecificData) || textEntries;
  const text = classifyAlibabaFreeTierQuotaEntries(textEntries, { textOnly: true });
  const vision = classifyAlibabaVisionFreeTierQuotaEntries(visionEntries);
  const multimodal = classifyAlibabaMultimodalFreeTierQuotaEntries(multimodalEntries);
  const audio = classifyAlibabaAudioFreeTierQuotaEntries(audioEntries);
  return {
    text,
    vision,
    multimodal,
    audio,
    entries: mergeUniqueQuotaEntries(textEntries, visionEntries, multimodalEntries, audioEntries)
  };
}
async function refreshAlibabaFreeTierQuotaClassification(provider, providerSpecificData) {
  if (!isAlibabaModelStudioProvider(provider) || getAlibabaBillingMode(providerSpecificData) !== "free") {
    return null;
  }
  if (!hasAlibabaConsoleFreeTierAuth(providerSpecificData)) {
    return null;
  }
  const snapshot = await buildAlibabaFreeTierQuotaSnapshot(providerSpecificData);
  if (!snapshot) return null;
  return mergeAlibabaFreeTierQuotaClassification(providerSpecificData, snapshot);
}
function scheduleAlibabaFreeTierQuotaRefresh(provider, connection) {
  if (!hasAlibabaConsoleFreeTierAuth(connection.providerSpecificData)) return;
  void (async () => {
    try {
      const merged = await refreshAlibabaFreeTierQuotaClassification(
        provider,
        connection.providerSpecificData
      );
      if (!merged) return;
      const { updateProviderConnection } = await import("../utils/omni/dbProviders.js");
      await updateProviderConnection(connection.id, { providerSpecificData: merged });
      await propagateAlibabaFreeTierEligibilityToSiblings(provider, connection.id, merged);
    } catch (error) {
      log.warn("ALIBABA-FREE-TIER", "[alibaba-free-tier] console quota refresh failed", {
        connectionId: connection.id,
        error: sanitize(error instanceof Error ? error.message : String(error))
      });
    }
  })();
}
export {
  applyAlibabaSharedFreeTierEligibility2 as applyAlibabaSharedFreeTierEligibility,
  buildAlibabaFreeAudioFilterContext,
  buildAlibabaFreeMultimodalFilterContext,
  buildAlibabaFreeTierQuotaSnapshot,
  buildAlibabaFreeTierTextFilterContext,
  buildAlibabaFreeVisionFilterContext,
  classifyAlibabaAudioFreeTierQuotaEntries2 as classifyAlibabaAudioFreeTierQuotaEntries,
  classifyAlibabaFreeTierQuotaEntries2 as classifyAlibabaFreeTierQuotaEntries,
  classifyAlibabaFreeTierQuotaEntry,
  classifyAlibabaMultimodalFreeTierQuotaEntries2 as classifyAlibabaMultimodalFreeTierQuotaEntries,
  classifyAlibabaVisionFreeTierQuotaEntries2 as classifyAlibabaVisionFreeTierQuotaEntries,
  classifyAlibabaVisionFreeTierQuotaEntry,
  extractAlibabaSharedFreeTierEligibility2 as extractAlibabaSharedFreeTierEligibility,
  fetchAlibabaFreeTierAudioQuotaEntries,
  fetchAlibabaFreeTierMultimodalQuotaEntries,
  fetchAlibabaFreeTierQuotaEntries,
  fetchAlibabaFreeTierVisionQuotaEntries,
  filterAlibabaFreeAudioEligibleModels,
  filterAlibabaFreeMultimodalEligibleModels,
  filterAlibabaFreeVisionEligibleModels,
  getAlibabaConsoleCookie,
  getAlibabaConsoleSecToken,
  getAlibabaFreeTierQuotaLastSyncAt2 as getAlibabaFreeTierQuotaLastSyncAt,
  getAlibabaFreeTierVisionCapableModels,
  getAlibabaFreeTierVisionDrainedModels,
  getAlibabaNoFreeTierVisionModels,
  hasAlibabaConsoleFreeTierAuth,
  isAlibabaFreeTierAudioCapableModel,
  isAlibabaFreeTierMultimodalCapableModel,
  isAlibabaFreeTierVisionCapableModel,
  isAlibabaLiveQuotaSyncAt,
  isAlibabaQuotaValidityExpired,
  mergeAlibabaFreeTierQuotaClassification,
  normalizeAlibabaConsoleCookie,
  parseAlibabaFreeTierQuotaEntries2 as parseAlibabaFreeTierQuotaEntries,
  pickCanonicalAlibabaFreeTierConnection,
  propagateAlibabaFreeTierEligibilityToSiblings,
  refreshAlibabaFreeTierQuotaClassification,
  scheduleAlibabaFreeTierQuotaRefresh
};
