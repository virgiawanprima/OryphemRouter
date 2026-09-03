import { PROVIDER_TIER } from "./tierTypes.js";
import { getModelPricing } from "./providerCostData.js";
import { isExplicitlyFree } from "./providerCostData.js";
import { mergeTierConfig, DEFAULT_TIER_CONFIG } from "./tierConfig.js";
let dbPersistenceChecked = false;
const tierCache = /* @__PURE__ */ new Map();
let currentConfig = DEFAULT_TIER_CONFIG;
function cacheKey(provider, model) {
  return `${provider}::${model}`;
}
function matchGlob(pattern, text) {
  const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`, "i").test(text);
}
function classifyTier(provider, model) {
  const key = cacheKey(provider, model);
  if (tierCache.has(key)) {
    return tierCache.get(key);
  }
  if (isExplicitlyFree(provider, currentConfig)) {
    const assignment2 = {
      provider,
      model,
      tier: PROVIDER_TIER.FREE,
      reason: `Provider '${provider}' is in explicit free providers list`,
      costPer1MInput: 0,
      costPer1MOutput: 0,
      hasFreeTier: true
    };
    tierCache.set(key, assignment2);
    return assignment2;
  }
  const providerOverride = currentConfig.providerOverrides.find(
    (o) => o.provider.toLowerCase() === provider.toLowerCase()
  );
  if (providerOverride) {
    const pricing2 = getModelPricing(provider, model);
    const assignment2 = {
      provider,
      model,
      tier: providerOverride.tier,
      reason: `Provider-level override: '${provider}' \u2192 ${providerOverride.tier}`,
      costPer1MInput: pricing2.inputCostPer1M,
      costPer1MOutput: pricing2.outputCostPer1M,
      hasFreeTier: pricing2.isFree,
      freeQuotaLimit: pricing2.freeQuotaLimit
    };
    tierCache.set(key, assignment2);
    return assignment2;
  }
  const modelOverride = currentConfig.modelOverrides.find(
    (o) => o.provider.toLowerCase() === provider.toLowerCase() && matchGlob(o.modelPattern, model)
  );
  if (modelOverride) {
    const pricing2 = getModelPricing(provider, model);
    const assignment2 = {
      provider,
      model,
      tier: modelOverride.tier,
      reason: `Model-level override: '${provider}/${model}' matches '${modelOverride.modelPattern}' \u2192 ${modelOverride.tier}`,
      costPer1MInput: pricing2.inputCostPer1M,
      costPer1MOutput: pricing2.outputCostPer1M,
      hasFreeTier: pricing2.isFree,
      freeQuotaLimit: pricing2.freeQuotaLimit
    };
    tierCache.set(key, assignment2);
    return assignment2;
  }
  const pricing = getModelPricing(provider, model);
  let tier;
  let reason;
  if (pricing.isFree || pricing.inputCostPer1M <= currentConfig.defaults.freeThreshold) {
    tier = PROVIDER_TIER.FREE;
    reason = `Cost-based: $${pricing.inputCostPer1M}/M input \u2264 free threshold ($${currentConfig.defaults.freeThreshold}/M)`;
  } else if (pricing.inputCostPer1M <= currentConfig.defaults.cheapThreshold) {
    tier = PROVIDER_TIER.CHEAP;
    reason = `Cost-based: $${pricing.inputCostPer1M}/M input \u2264 cheap threshold ($${currentConfig.defaults.cheapThreshold}/M)`;
  } else {
    tier = PROVIDER_TIER.PREMIUM;
    reason = `Cost-based: $${pricing.inputCostPer1M}/M input > cheap threshold ($${currentConfig.defaults.cheapThreshold}/M)`;
  }
  const assignment = {
    provider,
    model,
    tier,
    reason,
    costPer1MInput: pricing.inputCostPer1M,
    costPer1MOutput: pricing.outputCostPer1M,
    hasFreeTier: pricing.isFree,
    freeQuotaLimit: pricing.freeQuotaLimit
  };
  tierCache.set(key, assignment);
  return assignment;
}
function setTierConfig(config) {
  if (config === null || config === void 0) {
    try {
      const { loadTierConfig } = require("../../src/lib/db/tierConfig");
      currentConfig = loadTierConfig();
    } catch {
      currentConfig = DEFAULT_TIER_CONFIG;
    }
  } else {
    currentConfig = mergeTierConfig(config);
  }
  tierCache.clear();
}
function getTierConfig() {
  return { ...currentConfig };
}
function clearTierCache() {
  tierCache.clear();
}
function classifyTiers(targets) {
  return targets.map((t) => classifyTier(t.provider, t.model));
}
function getTierStats() {
  const stats = { free: 0, cheap: 0, premium: 0 };
  for (const assignment of tierCache.values()) {
    stats[assignment.tier]++;
  }
  return stats;
}
export {
  classifyTier,
  classifyTiers,
  clearTierCache,
  getTierConfig,
  getTierStats,
  setTierConfig
};
