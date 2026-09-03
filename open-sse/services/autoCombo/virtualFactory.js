import { MODE_PACKS } from "./modePacks.js";
import { DEFAULT_WEIGHTS } from "./scoring.js";
import { getCachedProviderConnections } from "../../utils/omni/readCacheConnections.js";
import { getSettings } from "../../utils/omni/dbSettings.js";
import { getProviderRegistry } from "./providerRegistryAccessor.js";
import { NOAUTH_PROVIDERS } from "../../utils/omni/providerRegistry.js";
import { hasUsableWebSessionCredential } from "../../utils/omni/webSessionCredentialsAuto.js";
import { toNumber } from "../../utils/omni/numeric.js";
import { isCompatibleProviderConnectionId } from "../../utils/omni/omniCompatibleProviderId.js";
import { defaultLogger as log } from "../../utils/omni/loggerDefault.js";
import { getTokenLimit } from "../contextManager.js";
import {
  createModelCapabilityResolutionSnapshot,
  getResolvedModelCapabilities
} from "../../utils/omni/autoModelCapabilities.js";
import {
  buildAutoCandidateFilter,
  tierToWeightVariant
} from "./suffixComposition.js";
import { classifyTier } from "../tierResolver.js";
import { buildFamilyCandidateFilter } from "./modelFamily.js";
import { getHiddenModelsByProvider } from "../../utils/omni/hiddenModels.js";
import { getSyncedAvailableModelsByConnection, getCustomModels } from "../../utils/omni/autoDbModels.js";
import { filterPaidOnlyCandidates } from "./paidModelFilter.js";
import { filterStrictZeroCostCandidates, filterTosAvoidCandidates } from "./strictZeroCostFilter.js";
import { resolveFreeAccessState } from "./freeAccessQuota.js";
import { isModelExcludedByConnection } from "../../utils/omni/connectionModelRules.js";
import { resolveProviderAlias } from "../model.js";
import { filterExcludedCandidates } from "./candidateOverrides.js";
import { getExcludedConnectionIds } from "../../utils/omni/db-autoCandidateOverrides.js";
import {
  filterResilienceBlockedCandidates,
  SYNTHETIC_NOAUTH_CONNECTION_ID as RESILIENCE_NOAUTH_CONNECTION_ID
} from "./resilienceCandidateFilter.js";
const emptyPoolWarned = /* @__PURE__ */ new Set();
function warnEmptyAutoPoolOnce(label, message, _now = Date.now()) {
  if (emptyPoolWarned.has(label)) return false;
  emptyPoolWarned.add(label);
  log.warn("AUTO", message);
  return true;
}
function resetEmptyAutoPoolWarnStateForTests() {
  emptyPoolWarned.clear();
}
function toExpiryMs(value) {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim().length > 0 ? Number(value) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed < 1e10 ? parsed * 1e3 : parsed;
  }
  if (typeof value === "string") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}
function hasUsableOAuthToken(conn) {
  if (typeof conn.accessToken !== "string" || conn.accessToken.trim().length === 0) return false;
  const expiryMs = toExpiryMs(conn.tokenExpiresAt) ?? toExpiryMs(conn.expiresAt);
  return expiryMs === null || expiryMs > Date.now();
}
function hasProviderSpecificSessionData(conn) {
  return hasUsableWebSessionCredential(conn.provider, conn.providerSpecificData);
}
function isKeylessEligibleConnection(conn) {
  return isCompatibleProviderConnectionId(conn.provider);
}
function hasUsableConnectionCredential(conn) {
  const hasApiKey = typeof conn.apiKey === "string" && conn.apiKey.trim().length > 0;
  return hasApiKey || hasUsableOAuthToken(conn) || hasProviderSpecificSessionData(conn) || isKeylessEligibleConnection(conn);
}
const SYNTHETIC_NOAUTH_CONNECTION_ID = RESILIENCE_NOAUTH_CONNECTION_ID;
const AUTO_COMBO_NOAUTH_ALLOWLIST = /* @__PURE__ */ new Set(["opencode", "felo-web"]);
function isChatAutoComboNoAuthProvider(providerDef, bypassAllowlist) {
  if (providerDef.noAuth !== true) return false;
  if (!bypassAllowlist && !AUTO_COMBO_NOAUTH_ALLOWLIST.has(providerDef.id)) return false;
  if (!Array.isArray(providerDef.serviceKinds) || providerDef.serviceKinds.length === 0)
    return true;
  return providerDef.serviceKinds.includes("llm");
}
function getNoAuthCandidates(excludedProviders, blockedProviders, disabledNoAuthProviders, noAuthProviderSpecificData, hiddenModelsMap, bypassAllowlist) {
  const registry = getProviderRegistry();
  const candidates = [];
  for (const providerDef of Object.values(NOAUTH_PROVIDERS)) {
    if (!isChatAutoComboNoAuthProvider(providerDef, bypassAllowlist)) continue;
    const providerId = providerDef.id;
    if (!providerId || excludedProviders.has(providerId)) continue;
    if (blockedProviders.has(providerId) || typeof providerDef.alias === "string" && blockedProviders.has(providerDef.alias))
      continue;
    if (disabledNoAuthProviders.has(providerId) || typeof providerDef.alias === "string" && disabledNoAuthProviders.has(providerDef.alias))
      continue;
    const providerInfo = registry[providerId];
    const registryModels = Array.isArray(providerInfo?.models) ? providerInfo.models : [];
    if (registryModels.length === 0) continue;
    const registryAlias = typeof providerInfo?.alias === "string" && providerInfo.alias.trim().length > 0 ? providerInfo.alias : null;
    const routingPrefix = providerDef.alias || registryAlias || providerId;
    const providerSpecificData = noAuthProviderSpecificData.get(providerId) ?? (typeof providerDef.alias === "string" ? noAuthProviderSpecificData.get(providerDef.alias) : void 0);
    const hiddenLookupIds = [
      providerId,
      typeof providerDef.alias === "string" ? providerDef.alias : null,
      registryAlias,
      routingPrefix,
      resolveProviderAlias(providerId),
      resolveProviderAlias(routingPrefix)
    ];
    const hiddenModels = /* @__PURE__ */ new Set();
    for (const id of hiddenLookupIds) {
      if (!id) continue;
      for (const modelId of hiddenModelsMap.get(id) ?? []) hiddenModels.add(modelId);
    }
    for (const model of registryModels) {
      const modelId = typeof model?.id === "string" && model.id.trim().length > 0 ? model.id : null;
      if (!modelId) continue;
      if (isModelExcludedByConnection(modelId, providerSpecificData)) continue;
      if (hiddenModels?.has(modelId)) continue;
      candidates.push({
        provider: providerId,
        connectionId: SYNTHETIC_NOAUTH_CONNECTION_ID,
        model: modelId,
        modelStr: `${routingPrefix}/${modelId}`,
        costPer1MTokens: 0
      });
    }
  }
  return candidates;
}
const DEFAULT_ADVERTISED_MAX_OUTPUT_TOKENS = 8192;
function computeAdvertisedLimits(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { contextLength: null, maxOutputTokens: null };
  }
  let contextLength = null;
  let maxOutputTokens = null;
  for (const candidate of candidates) {
    const limit = candidate.resolvedContextLength !== void 0 ? candidate.resolvedContextLength : getTokenLimit(candidate.provider, candidate.model);
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      contextLength = contextLength === null ? limit : Math.max(contextLength, limit);
    }
    const output = candidate.resolvedMaxOutputTokens !== void 0 ? candidate.resolvedMaxOutputTokens : getResolvedModelCapabilities({
      provider: candidate.provider,
      model: candidate.model
    }).maxOutputTokens;
    if (typeof output === "number" && Number.isFinite(output) && output > 0) {
      maxOutputTokens = maxOutputTokens === null ? output : Math.max(maxOutputTokens, output);
    }
  }
  if (maxOutputTokens === null) {
    maxOutputTokens = DEFAULT_ADVERTISED_MAX_OUTPUT_TOKENS;
  }
  return { contextLength, maxOutputTokens };
}
const VIRTUAL_AUTO_PREPARATION_YIELD_INTERVAL = 4;
function yieldVirtualAutoPreparationTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}
async function attachPreparedCapabilityValues(candidates, state) {
  const prepared = [];
  for (const candidate of candidates) {
    let byModel = state.byTarget.get(candidate.provider);
    if (!byModel) {
      byModel = /* @__PURE__ */ new Map();
      state.byTarget.set(candidate.provider, byModel);
    }
    let values = byModel.get(candidate.model);
    if (!values) {
      const contextLength = getTokenLimit(
        candidate.provider,
        candidate.model,
        state.resolutionSnapshot
      );
      const capabilities = getResolvedModelCapabilities(
        {
          provider: candidate.provider,
          model: candidate.model
        },
        void 0,
        state.resolutionSnapshot
      );
      const maxOutputTokens = capabilities.maxOutputTokens;
      values = {
        resolvedContextLength: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
        resolvedMaxOutputTokens: typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : null,
        resolvedSupportsVision: capabilities.supportsVision === true,
        resolvedReasoning: capabilities.reasoning === true,
        resolvedSupportsThinking: capabilities.supportsThinking === true
      };
      byModel.set(candidate.model, values);
      state.resolvedSinceYield++;
      if (state.resolvedSinceYield >= VIRTUAL_AUTO_PREPARATION_YIELD_INTERVAL) {
        state.resolvedSinceYield = 0;
        await yieldVirtualAutoPreparationTurn();
      }
    }
    prepared.push({ ...candidate, ...values });
  }
  return prepared;
}
async function prepareVirtualAutoComboInputs(options = {}) {
  const [connections, disabledNoAuthConnections, settings] = await Promise.all([
    getCachedProviderConnections({ isActive: true }),
    // #6557: no-auth providers (opencode/mimocode/etc.) don't get an isActive
    // filter applied above since their credential is synthetic, but a real
    // provider_connections row CAN exist for them (created via "Add Account")
    // and its own isActive=false must gate the auto-combo pool too — not just
    getCachedProviderConnections({ isActive: false }),
    getSettings().catch(() => ({}))
  ]);
  const blockedProviders = new Set(
    Array.isArray(settings.blockedProviders) ? settings.blockedProviders : []
  );
  const disabledNoAuthProviders = new Set(
    disabledNoAuthConnections.filter((conn) => conn.provider in NOAUTH_PROVIDERS).map((conn) => conn.provider)
  );
  const hiddenModelsMap = getHiddenModelsByProvider();
  const noAuthProviderSpecificData = /* @__PURE__ */ new Map();
  for (const conn of [...connections, ...disabledNoAuthConnections]) {
    if (conn.provider in NOAUTH_PROVIDERS) {
      noAuthProviderSpecificData.set(conn.provider, conn.providerSpecificData);
    }
  }
  const validConnections = connections.filter(hasUsableConnectionCredential);
  const candidatePool = [];
  const registry = getProviderRegistry();
  const connectionsByProvider = /* @__PURE__ */ new Map();
  for (const conn of validConnections) {
    const providerConnections = connectionsByProvider.get(conn.provider) ?? [];
    providerConnections.push(conn);
    connectionsByProvider.set(conn.provider, providerConnections);
  }
  let candidateModelsSinceYield = 0;
  for (const [providerId, providerConnections] of connectionsByProvider) {
    const providerInfo = registry[providerId];
    const registryModelIds = Array.isArray(providerInfo?.models) ? providerInfo.models.map((model) => typeof model?.id === "string" ? model.id.trim() : "").filter(Boolean) : [];
    const registryModelIdSet = new Set(registryModelIds);
    const defaultModelIds = providerConnections.map((conn) => typeof conn.defaultModel === "string" ? conn.defaultModel.trim() : "").filter(Boolean);
    const hiddenModels = hiddenModelsMap.get(providerId);
    const [syncedByConnection, customModels] = await Promise.all([
      getSyncedAvailableModelsByConnection(providerId),
      getCustomModels(providerId)
    ]);
    const userVisibleIds = /* @__PURE__ */ new Set();
    for (const models of Object.values(syncedByConnection)) {
      for (const m of models) if (m.id && !hiddenModels?.has(m.id)) userVisibleIds.add(m.id);
    }
    for (const m of customModels) if (m.id && !hiddenModels?.has(m.id)) userVisibleIds.add(m.id);
    const hasUserModels = userVisibleIds.size > 0;
    const modelIds = hasUserModels ? Array.from(userVisibleIds) : Array.from(/* @__PURE__ */ new Set([...registryModelIds, ...defaultModelIds]));
    for (const modelId of modelIds) {
      candidateModelsSinceYield++;
      if (candidateModelsSinceYield >= VIRTUAL_AUTO_PREPARATION_YIELD_INTERVAL) {
        candidateModelsSinceYield = 0;
        await yieldVirtualAutoPreparationTurn();
      }
      if (hiddenModels?.has(modelId)) continue;
      const allowedConnectionIds = providerConnections.filter((conn) => {
        if (isModelExcludedByConnection(modelId, conn.providerSpecificData)) return false;
        if (hasUserModels) {
          const connSynced = syncedByConnection[conn.id] ?? [];
          const isSyncedForConn = connSynced.some((m) => m.id === modelId);
          const isCustomForProvider = customModels.some((m) => m.id === modelId);
          return isSyncedForConn || isCustomForProvider || conn.defaultModel?.trim() === modelId;
        }
        return registryModelIdSet.has(modelId) || conn.defaultModel?.trim() === modelId;
      }).map((conn) => conn.id);
      if (allowedConnectionIds.length === 0) continue;
      candidatePool.push({
        provider: providerId,
        connectionId: null,
        allowedConnectionIds,
        model: modelId,
        modelStr: `${providerId}/${modelId}`,
        costPer1MTokens: 0
        // Not used in virtual auto-combo (LKGP uses session stickiness)
      });
    }
  }
  const connectionsById = /* @__PURE__ */ new Map();
  for (const conn of [...connections, ...disabledNoAuthConnections]) {
    connectionsById.set(conn.id, conn);
  }
  const connectedProviders = new Set(validConnections.map((conn) => conn.provider));
  const buildPreparedPool = (bypassNoAuthAllowlist) => {
    let pool = [
      ...candidatePool,
      ...getNoAuthCandidates(
        connectedProviders,
        blockedProviders,
        disabledNoAuthProviders,
        noAuthProviderSpecificData,
        hiddenModelsMap,
        bypassNoAuthAllowlist
      )
    ];
    const resilienceFilteredPool = filterResilienceBlockedCandidates(pool, connectionsById);
    if (resilienceFilteredPool !== pool) pool = resilienceFilteredPool;
    const paidFilteredPool = filterPaidOnlyCandidates(pool, settings.hidePaidModels === true);
    if (paidFilteredPool !== pool) pool = paidFilteredPool;
    const strictFilteredPool = filterStrictZeroCostCandidates(pool, {
      enabled: settings.freeAccessPolicy === "strict",
      resolveFreeAccessState,
      // 1 percentage point of headroom, not 0: `freeAccessQuota.ts` reports
      // remaining allowance as a percentage, and a raw ">0" comparison would
      // let a reading of e.g. 0.3% (rounding noise, not real headroom) pass.
      minRemainingAllowance: 1,
      maxStateAgeMs: toNumber(settings.autoRefreshProviderQuotaInterval, 180) * 1e3
    });
    if (strictFilteredPool !== pool) pool = strictFilteredPool;
    const tosFilteredPool = filterTosAvoidCandidates(pool, settings.excludeTosAvoid === true);
    if (tosFilteredPool !== pool) pool = tosFilteredPool;
    return pool;
  };
  const regularCandidates = buildPreparedPool(false);
  const familyCandidates = buildPreparedPool(true);
  if (!options.includeResolvedCapabilities) {
    return { regularCandidates, familyCandidates };
  }
  const capabilityState = {
    byTarget: /* @__PURE__ */ new Map(),
    resolvedSinceYield: 0,
    resolutionSnapshot: options.resolutionSnapshot ?? createModelCapabilityResolutionSnapshot()
  };
  return {
    regularCandidates: await attachPreparedCapabilityValues(regularCandidates, capabilityState),
    familyCandidates: await attachPreparedCapabilityValues(familyCandidates, capabilityState)
  };
}
function computeSnapshotWeights(candidates, weights) {
  const scores = /* @__PURE__ */ new Map();
  for (const c of candidates) {
    let score = 0;
    if (weights.taskFit > 0) {
      if (c.resolvedReasoning || c.resolvedSupportsThinking) score += weights.taskFit * 0.6;
      if (c.resolvedSupportsVision) score += weights.taskFit * 0.3;
    }
    if (weights.stability > 0) {
      const capabilityCount = Number(c.resolvedReasoning ?? false) + Number(c.resolvedSupportsThinking ?? false) + Number(c.resolvedSupportsVision ?? false);
      score += weights.stability * Math.min(capabilityCount / 2, 1);
    }
    let tierInfo = null;
    if (weights.tierPriority > 0 || weights.costInv > 0) {
      try {
        tierInfo = classifyTier(c.provider, c.model);
      } catch {
      }
    }
    if (tierInfo && weights.tierPriority > 0 && tierInfo.tier === "premium")
      score += weights.tierPriority;
    if (tierInfo && weights.costInv > 0 && tierInfo.tier === "free") score += weights.costInv;
    if (weights.latencyInv > 0) score += weights.latencyInv * 0.5;
    score += (weights.health + weights.quota) * 0.5;
    scores.set(c.modelStr, Math.min(score, 1));
  }
  return scores;
}
function clonePreparedCandidates(candidates) {
  return candidates.map((candidate) => ({
    ...candidate,
    ...candidate.allowedConnectionIds ? { allowedConnectionIds: [...candidate.allowedConnectionIds] } : {}
  }));
}
async function createVirtualAutoComboFromPrepared(prepared, variant, spec, apiKeyId, autoChannel) {
  let candidatePool = clonePreparedCandidates(
    spec?.family ? prepared.familyCandidates : prepared.regularCandidates
  );
  let excludedConnectionIds = /* @__PURE__ */ new Set();
  if (apiKeyId && autoChannel) {
    try {
      excludedConnectionIds = await getExcludedConnectionIds(apiKeyId, autoChannel);
    } catch (err) {
      log.warn("AUTO", "Failed to load auto-candidate overrides; routing unfiltered", { err });
    }
  }
  const overrideFilteredPool = filterExcludedCandidates(candidatePool, excludedConnectionIds);
  if (overrideFilteredPool !== candidatePool) {
    candidatePool.length = 0;
    candidatePool.push(...overrideFilteredPool);
  }
  if (candidatePool.length === 0) {
    log.warn("AUTO", "No connected providers with valid credentials for virtual auto-combo");
    const emptyPool = [];
    const autoConfig2 = {
      candidatePool: emptyPool,
      weights: { ...DEFAULT_WEIGHTS },
      explorationRate: 0.05,
      routerStrategy: "lkgp"
    };
    return {
      id: `virtual-auto-${variant || "default"}`,
      name: `Auto ${variant || "Default"}`,
      type: "auto",
      strategy: "auto",
      models: [],
      candidatePool: emptyPool,
      weights: autoConfig2.weights,
      explorationRate: autoConfig2.explorationRate,
      routerStrategy: autoConfig2.routerStrategy,
      autoConfig: autoConfig2,
      config: { auto: autoConfig2 },
      advertisedContextLength: null,
      advertisedMaxOutputTokens: null
    };
  }
  let effectivePool = candidatePool;
  const candidateFilter = spec?.family ? buildFamilyCandidateFilter(spec.family) : spec ? buildAutoCandidateFilter(spec.category, spec.tier) : null;
  if (candidateFilter) {
    const narrowed = candidatePool.filter((candidate) => candidateFilter(candidate));
    const label = spec?.family ? `auto/${spec.family}` : `auto/${spec?.category ?? ""}${spec?.tier ? `:${spec.tier}` : ""}`;
    if (narrowed.length > 0) {
      effectivePool = narrowed;
    } else if (!spec?.family && (process.env.OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL === "true" || process.env.OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL === "1")) {
      log.warn(
        "AUTO",
        `${label} matched no connected models; falling back to the full pool (OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL=true)`
      );
    } else {
      warnEmptyAutoPoolOnce(
        label,
        `${label} matched no connected models; returning an empty pool.${spec?.family ? "" : ' Set OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL=true to restore the legacy "use full pool" behavior.'}`
      );
      effectivePool = [];
    }
  }
  let weights = { ...DEFAULT_WEIGHTS };
  let explorationRate = 0.05;
  let routerStrategy = "lkgp";
  switch (variant) {
    case "coding":
      weights = { ...MODE_PACKS["quality-first"] };
      break;
    case "fast":
      weights = { ...MODE_PACKS["ship-fast"] };
      break;
    case "cheap":
      weights = { ...MODE_PACKS["cost-saver"] };
      break;
    case "offline":
      weights = { ...MODE_PACKS["offline-friendly"] };
      break;
    case "smart":
      weights = { ...MODE_PACKS["quality-first"] };
      explorationRate = 0.1;
      break;
    case "lkgp":
      break;
    case "chaos":
      weights = { ...MODE_PACKS["chaos-mode"] };
      explorationRate = 0;
      break;
    case void 0:
      break;
  }
  if (spec) {
    if (spec.category && spec.category !== "chat") {
      weights = { ...MODE_PACKS["quality-first"] };
    }
    const weightVariant = tierToWeightVariant(spec.tier);
    if (weightVariant === "fast") {
      weights = { ...MODE_PACKS["ship-fast"] };
    } else if (weightVariant === "cheap") {
      weights = { ...MODE_PACKS["cost-saver"] };
    } else if (weightVariant === "reliability") {
      weights = { ...MODE_PACKS["reliability-first"] };
    }
  }
  const providerPool = [...new Set(effectivePool.map((c) => c.provider))];
  const snapshotScores = computeSnapshotWeights(effectivePool, weights);
  const models = effectivePool.map((candidate, index) => ({
    id: `virtual-auto-${variant || "default"}-${index + 1}-${candidate.provider}`,
    kind: "model",
    model: candidate.modelStr,
    providerId: candidate.provider,
    connectionId: candidate.connectionId,
    ...candidate.allowedConnectionIds ? { allowedConnectionIds: candidate.allowedConnectionIds } : {},
    weight: snapshotScores.get(candidate.modelStr) ?? 1,
    label: candidate.provider
  }));
  const autoConfig = {
    candidatePool: providerPool,
    weights,
    explorationRate,
    routerStrategy
  };
  const isChaos = variant === "chaos";
  const CHAOS_MAX_PANEL = (() => {
    const env = process.env.OMNIROUTE_CHAOS_MAX_PANEL;
    const parsed = env ? parseInt(env, 10) : 5;
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 5;
  })();
  let chaosModels;
  if (isChaos) {
    const seenProviders = /* @__PURE__ */ new Set();
    const diverse = [];
    for (const m of models) {
      if (seenProviders.has(m.providerId)) continue;
      seenProviders.add(m.providerId);
      diverse.push(m);
      if (diverse.length >= CHAOS_MAX_PANEL) break;
    }
    chaosModels = diverse.length > 0 ? diverse : models.slice(0, CHAOS_MAX_PANEL);
  } else {
    chaosModels = models;
  }
  const advertisedLimits = computeAdvertisedLimits(effectivePool);
  return {
    id: `virtual-auto-${variant || "default"}`,
    name: `Auto ${variant || "Default"}`,
    type: "auto",
    strategy: "auto",
    models: chaosModels,
    candidatePool: providerPool,
    weights,
    explorationRate,
    routerStrategy,
    autoConfig,
    // For chaos, stash the panel size + a flag so downstream handlers can detect
    // the broadcast mode and stream each panel model back to IDEs that opt in.
    config: {
      auto: autoConfig,
      ...isChaos ? {
        chaos: {
          enabled: true,
          panelSize: chaosModels.length,
          judgeModel: chaosModels[0]?.model,
          tuning: {
            panelHardTimeoutMs: Number(process.env.OMNIROUTE_CHAOS_PANEL_TIMEOUT_MS) || void 0,
            minPanel: Number(process.env.OMNIROUTE_CHAOS_MIN_PANEL) || void 0
          }
        }
      } : {}
    },
    advertisedContextLength: advertisedLimits.contextLength,
    advertisedMaxOutputTokens: advertisedLimits.maxOutputTokens
  };
}
async function createVirtualAutoCombo(variant, spec, apiKeyId, autoChannel) {
  const prepared = await prepareVirtualAutoComboInputs();
  return createVirtualAutoComboFromPrepared(prepared, variant, spec, apiKeyId, autoChannel);
}
export {
  computeAdvertisedLimits,
  computeSnapshotWeights,
  createVirtualAutoCombo,
  createVirtualAutoComboFromPrepared,
  prepareVirtualAutoComboInputs,
  resetEmptyAutoPoolWarnStateForTests,
  warnEmptyAutoPoolOnce
};
