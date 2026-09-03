import { classifyTier } from "../tierResolver.js";
import { getResolvedModelCapabilities } from "../../utils/omni/autoModelCapabilities.js";
import { isVisionModelId } from "../../utils/visionModels.js";
import { isVisionBridgeForcedModel } from "../../utils/omni/visionBridgeDefaults.js";
const AUTO_CATEGORIES = [
  "coding",
  "reasoning",
  "vision",
  "chat",
  "multimodal"
];
const AUTO_TIERS = [
  "fast",
  "cheap",
  "floor",
  "free",
  "reliable",
  "pro"
];
const CATEGORY_SET = new Set(AUTO_CATEGORIES);
const TIER_SET = new Set(AUTO_TIERS);
function parseAutoSuffix(suffix) {
  if (typeof suffix !== "string" || suffix.length === 0) return { valid: false };
  const parts = suffix.split(":");
  if (parts.length > 2) return { valid: false };
  const [head, tail] = parts;
  if (tail !== void 0) {
    if (!CATEGORY_SET.has(head) || !TIER_SET.has(tail)) return { valid: false };
    return { valid: true, category: head, tier: tail };
  }
  if (CATEGORY_SET.has(head)) return { valid: true, category: head };
  return { valid: false };
}
function tierToWeightVariant(tier) {
  switch (tier) {
    case "fast":
      return "fast";
    case "cheap":
    case "floor":
      return "cheap";
    case "reliable":
      return "reliability";
    default:
      return void 0;
  }
}
function buildAutoCandidateFilter(category, tier) {
  const checks = [];
  if (category === "vision" || category === "multimodal") {
    checks.push((c) => {
      if (c.resolvedSupportsVision !== void 0) {
        return c.resolvedSupportsVision || isVisionModelId(c.model);
      }
      try {
        const caps = getResolvedModelCapabilities({ provider: c.provider, model: c.model });
        const capable = caps.supportsVision === true || isVisionModelId(c.model);
        if (!capable) return false;
        return !isVisionBridgeForcedModel(`${c.provider}/${c.model}`);
      } catch {
        return isVisionModelId(c.model) && !isVisionBridgeForcedModel(`${c.provider}/${c.model}`);
      }
    });
  }
  if (category === "reasoning") {
    checks.push((c) => {
      if (c.resolvedReasoning !== void 0 && c.resolvedSupportsThinking !== void 0) {
        return c.resolvedReasoning || c.resolvedSupportsThinking;
      }
      try {
        const caps = getResolvedModelCapabilities({ provider: c.provider, model: c.model });
        return caps.reasoning === true || caps.supportsThinking === true;
      } catch {
        return false;
      }
    });
  }
  if (tier === "free") {
    checks.push((c) => safeClassifyTier(c) === "free");
  }
  if (tier === "pro") {
    checks.push((c) => safeClassifyTier(c) === "premium");
  }
  if (checks.length === 0) return null;
  return (candidate) => checks.every((fn) => fn(candidate));
}
function safeClassifyTier(c) {
  try {
    return classifyTier(c.provider, c.model).tier;
  } catch {
    return "cheap";
  }
}
export {
  AUTO_CATEGORIES,
  AUTO_TIERS,
  buildAutoCandidateFilter,
  parseAutoSuffix,
  tierToWeightVariant
};
