import { getModelSpec } from "./omni/modelSpecs.js";
import { supportsXHighEffort } from "./omni/providerModelsExtra.js";
const CLAUDE_EFFORT_VARIANT_LEVELS = ["low", "medium", "high"];
const CLAUDE_XHIGH_EFFORT_LEVEL = "xhigh";
const CLAUDE_EFFORT_SUFFIX_RE = /-(?:xhigh|high|medium|low)$/i;
const CLAUDE_NAME_RE = /claude/i;
const NO_THINKING_PREFIX = "no-think/";
function bareModelName(id) {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}
function formatClaudeEffortLabel(level) {
  if (level === CLAUDE_XHIGH_EFFORT_LEVEL) return "XHigh";
  return level.charAt(0).toUpperCase() + level.slice(1);
}
function isKnownClaudeEffortBaseModel(bareModelId) {
  const spec = getModelSpec(bareModelId);
  return spec?.supportsThinking === true && CLAUDE_NAME_RE.test(bareModelId);
}
function shouldExposeClaudeEffortVariants(model) {
  if (!model || typeof model !== "object") return false;
  const id = model.id;
  if (typeof id !== "string" || id.length === 0) return false;
  if (model.owned_by === "combo") return false;
  if (id.startsWith(NO_THINKING_PREFIX)) return false;
  if (CLAUDE_EFFORT_SUFFIX_RE.test(id)) return false;
  const name = bareModelName(id);
  return isKnownClaudeEffortBaseModel(name);
}
function normalizeProviderPrefix(qualifiedId, aliasToCanonical) {
  const slash = qualifiedId.indexOf("/");
  if (slash < 0) return qualifiedId;
  const prefix = qualifiedId.slice(0, slash);
  const canonical = aliasToCanonical[prefix];
  return canonical && canonical !== prefix ? `${canonical}${qualifiedId.slice(slash)}` : qualifiedId;
}
function claudeEffortLevelsFor(providerId, modelId) {
  const levels = [...CLAUDE_EFFORT_VARIANT_LEVELS];
  if (supportsXHighEffort(providerId, modelId)) {
    levels.push(CLAUDE_XHIGH_EFFORT_LEVEL);
  }
  return levels;
}
function appendClaudeEffortVariants(models, aliasToCanonical) {
  if (!Array.isArray(models)) return models;
  const variants = [];
  for (const model of models) {
    if (!shouldExposeClaudeEffortVariants(model)) continue;
    const rawId = model.id;
    const qualifiedId = aliasToCanonical ? normalizeProviderPrefix(rawId, aliasToCanonical) : rawId;
    const slash = qualifiedId.indexOf("/");
    const providerId = slash >= 0 ? qualifiedId.slice(0, slash) : "";
    const bareName = bareModelName(qualifiedId);
    for (const level of claudeEffortLevelsFor(providerId, bareName)) {
      const variantId = `${qualifiedId}-${level}`;
      const baseRoot = typeof model.root === "string" && model.root ? model.root : bareName;
      const variant = { ...model, id: variantId, root: `${baseRoot}-${level}` };
      if (typeof model.name === "string" && model.name) {
        variant.name = `${model.name} (${formatClaudeEffortLabel(level)})`;
      }
      variants.push(variant);
    }
  }
  return variants.length > 0 ? [...models, ...variants] : models;
}
export {
  CLAUDE_EFFORT_VARIANT_LEVELS,
  CLAUDE_XHIGH_EFFORT_LEVEL,
  appendClaudeEffortVariants,
  claudeEffortLevelsFor,
  formatClaudeEffortLabel,
  isKnownClaudeEffortBaseModel,
  shouldExposeClaudeEffortVariants
};
