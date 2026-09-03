import { DEFAULT_LADDER, aggressivenessOf, expectedReductionFactor } from "./ladder.js";
import { computeTarget } from "./computeTarget.js";
const defaultEstimate = (prior, stage) => Math.round(prior * expectedReductionFactor(stage.engine));
function resolveAdaptivePlan(input) {
  const { basePlan, estimatedTokens, modelContextLimit, requestMaxTokens, config } = input;
  const estimate = input.estimate ?? defaultEstimate;
  if (config.mode === "off") return { plan: basePlan, telemetry: null };
  if (!modelContextLimit || modelContextLimit <= 0) {
    return { plan: basePlan, telemetry: null };
  }
  const target = computeTarget(config.policy, modelContextLimit, requestMaxTokens, config);
  const headroomBefore = target - estimatedTokens;
  const baseRank = aggressivenessOf(basePlan.mode);
  if (config.mode === "replace-autotrigger" && baseRank > aggressivenessOf("off")) {
    return {
      plan: basePlan,
      telemetry: { policy: config.policy, target, headroomBefore, stagesApplied: [], headroomAfter: headroomBefore, fit: headroomBefore >= 0 }
    };
  }
  if (headroomBefore >= 0) {
    return {
      plan: basePlan,
      telemetry: { policy: config.policy, target, headroomBefore, stagesApplied: [], headroomAfter: headroomBefore, fit: true }
    };
  }
  const ladder = config.ladderOverride && config.ladderOverride.length > 0 ? config.ladderOverride : DEFAULT_LADDER;
  const startTier = config.mode === "floor" ? baseRank : aggressivenessOf("off");
  const stages = ladder.filter((s) => aggressivenessOf(s.engine) > startTier);
  let current = estimatedTokens;
  const applied = [];
  for (const stage of stages) {
    current = estimate(current, stage);
    applied.push(stage);
    if (current <= target) break;
  }
  const headroomAfter = target - current;
  const fit = headroomAfter >= 0;
  return {
    plan: planFromStages(basePlan, applied),
    telemetry: {
      policy: config.policy,
      target,
      headroomBefore,
      stagesApplied: applied.map((s) => s.engine),
      headroomAfter,
      fit
    }
  };
}
function planFromStages(basePlan, applied) {
  if (applied.length === 0) return basePlan;
  const basePipeline = basePlan.mode === "stacked" ? basePlan.stackedPipeline : [];
  const stackedPipeline = [...basePipeline, ...applied];
  return { mode: "stacked", stackedPipeline };
}
export {
  resolveAdaptivePlan
};
