import { CANONICAL_EFFORT_VALUES } from "./omni/effortStandardization.js";
const SYNCED_EFFORT_SKIP_PROVIDERS = /* @__PURE__ */ new Set(["codex", "glm", "glm-cn", "glmt"]);
const SYNCED_EFFORT_SKIP_PROVIDER_PREFIXES = ["kimi"];
function isSkippedEffortProvider(ownedBy) {
  return SYNCED_EFFORT_SKIP_PROVIDERS.has(ownedBy) || SYNCED_EFFORT_SKIP_PROVIDER_PREFIXES.some((prefix) => ownedBy.startsWith(prefix));
}
function endsWithKnownEffortToken(id) {
  return CANONICAL_EFFORT_VALUES.some((value) => id.endsWith(`-${value}`));
}
function extractEffortTiers(model) {
  const tiers = model.capabilities?.effort_tiers;
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((tier) => typeof tier === "string" && tier.length > 0);
}
function shouldExposeSyncedEffortVariants(model) {
  if (!model || typeof model !== "object") return false;
  const id = model.id;
  if (typeof id !== "string" || id.length === 0) return false;
  if (model.owned_by === "combo") return false;
  if (typeof model.owned_by === "string" && isSkippedEffortProvider(model.owned_by)) {
    return false;
  }
  if (endsWithKnownEffortToken(id)) return false;
  return extractEffortTiers(model).length > 0;
}
function appendSyncedEffortVariants(models) {
  if (!Array.isArray(models)) return models;
  const variants = [];
  const existingIds = new Set(models.map((model) => model.id));
  for (const model of models) {
    if (!shouldExposeSyncedEffortVariants(model)) continue;
    const baseRoot = typeof model.root === "string" && model.root ? model.root : model.id;
    for (const tier of extractEffortTiers(model)) {
      const variantId = `${model.id}-${tier}`;
      if (existingIds.has(variantId)) continue;
      existingIds.add(variantId);
      variants.push({ ...model, id: variantId, root: `${baseRoot}-${tier}` });
    }
  }
  return variants.length > 0 ? [...models, ...variants] : models;
}
export {
  SYNCED_EFFORT_SKIP_PROVIDERS,
  appendSyncedEffortVariants,
  isSkippedEffortProvider,
  shouldExposeSyncedEffortVariants
};
