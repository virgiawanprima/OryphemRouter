import {
  analyzeSpecificity,
  getSpecificityLevel,
  getRecommendedMinTier
} from "../specificityDetector.js";
import { generateRoutingHints } from "../manifestAdapter.js";
const TIER_ORDER = ["free", "cheap", "premium"];
function escalateTier(tier, floor) {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(floor) ? tier : floor;
}
function classifyRequestComplexity(input) {
  const result = analyzeSpecificity(input);
  const level = getSpecificityLevel(result.score);
  const explicitTools = Array.isArray(input.tools) && input.tools.length > 0;
  const hasToolUse = explicitTools || result.breakdown.toolCalling > 0;
  let recommendedTier = getRecommendedMinTier(level);
  if (hasToolUse) recommendedTier = escalateTier(recommendedTier, "cheap");
  return {
    score: result.score,
    level,
    recommendedTier,
    hasToolUse,
    signals: result.rulesTriggered
  };
}
function buildComplexityRoutingHint(modelTargets, body, log) {
  try {
    const ruleInput = {
      messages: Array.isArray(body?.messages) ? body.messages : [],
      tools: Array.isArray(body?.tools) ? body.tools : void 0,
      model: typeof body?.model === "string" ? body.model : void 0
    };
    const hint = generateRoutingHints(modelTargets, ruleInput);
    const classification = classifyRequestComplexity(ruleInput);
    hint.recommendedMinTier = escalateTier(
      hint.recommendedMinTier,
      classification.recommendedTier
    );
    log.info(
      "COMBO",
      `Complexity-aware routing: level=${classification.level} score=${classification.score} minTier=${hint.recommendedMinTier} tools=${classification.hasToolUse}`
    );
    return hint;
  } catch {
    return null;
  }
}
export {
  buildComplexityRoutingHint,
  classifyRequestComplexity,
  escalateTier
};
