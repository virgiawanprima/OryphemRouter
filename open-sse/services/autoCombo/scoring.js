import { clamp01 } from "../../utils/number.js";
import { classifyTier } from "../tierResolver.js";
const DEFAULT_WEIGHTS = {
  quota: 0.1429,
  health: 0.1605,
  costInv: 0.1429,
  latencyInv: 0.1143,
  taskFit: 0.0762,
  stability: 0.0476,
  tierPriority: 0.0476,
  tierAffinity: 0.0476,
  specificityMatch: 0.0476,
  contextAffinity: 0.0476,
  cacheAffinity: 0,
  sessionAvailability: 0.0476,
  resetWindowAffinity: 0,
  connectionDensity: 0.0476,
  // Shifted from `health` (0.1905 → 0.1605): availability stays dominant, and
  // the new quality signal (observed output quality over time) gets a real,
  // if smaller, vote. Sum remains exactly 1.0.
  quality: 0.03
};
function normalizeScoringWeights(weights) {
  if (!weights) return { ...DEFAULT_WEIGHTS };
  const entries = Object.keys(DEFAULT_WEIGHTS);
  const sanitized = Object.fromEntries(
    entries.map((key) => {
      const value = Number(weights?.[key]);
      return [key, Number.isFinite(value) && value >= 0 ? value : 0];
    })
  );
  const total = entries.reduce((sum, key) => sum + Number(sanitized[key] ?? 0), 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(
    entries.map((key) => [key, Number(sanitized[key] ?? 0) / total])
  );
}
function calculateScore(factors, weights) {
  return clamp01(
    weights.quota * factors.quota + weights.health * factors.health + weights.costInv * factors.costInv + weights.latencyInv * factors.latencyInv + weights.taskFit * factors.taskFit + weights.stability * factors.stability + weights.tierPriority * factors.tierPriority + (weights.tierAffinity ?? 0) * factors.tierAffinity + (weights.specificityMatch ?? 0) * factors.specificityMatch + (weights.contextAffinity ?? 0) * factors.contextAffinity + (weights.cacheAffinity ?? 0) * (factors.cacheAffinity ?? 0) + (weights.sessionAvailability ?? 0) * (factors.sessionAvailability ?? 1) + (weights.resetWindowAffinity ?? 0) * factors.resetWindowAffinity + (weights.connectionDensity ?? 0) * factors.connectionDensity + // Missing quality factor → neutral 0.5: a cold candidate is neither boosted
    // (which would let optimistic initialization dominate) nor penalized.
    (weights.quality ?? 0) * (factors.quality ?? 0.5)
  );
}
function calculateTierScore(tier, quotaResetIntervalSecs) {
  const BASE_TIER_SCORES = {
    ultra: 1,
    pro: 0.67,
    standard: 0.33,
    free: 0
  };
  const baseScore = BASE_TIER_SCORES[tier?.toLowerCase() ?? ""] ?? 0.33;
  const resetBonus = quotaResetIntervalSecs != null && quotaResetIntervalSecs > 0 ? Math.max(0, 1 - quotaResetIntervalSecs / 2592e3) : 0;
  return Math.min(1, baseScore * 0.8 + resetBonus * 0.2);
}
function calculateTierAffinity(candidate, hint) {
  if (!hint) return 0.5;
  try {
    const assignment = classifyTier(candidate.provider, candidate.model);
    const tierOrder = ["free", "cheap", "premium"];
    const providerTierIdx = tierOrder.indexOf(assignment.tier);
    const minTierIdx = tierOrder.indexOf(hint.recommendedMinTier);
    if (providerTierIdx === minTierIdx) return 1;
    if (Math.abs(providerTierIdx - minTierIdx) === 1) return 0.7;
    return 0.3;
  } catch {
    return 0.5;
  }
}
function calculateSpecificityMatch(candidate, hint) {
  if (!hint) return 0.5;
  try {
    const assignment = classifyTier(candidate.provider, candidate.model);
    const specificityScore = hint.specificity.score;
    if (assignment.tier === "free") return specificityScore <= 15 ? 0.9 : 0.2;
    if (assignment.tier === "cheap")
      return specificityScore > 15 && specificityScore <= 50 ? 0.9 : 0.4;
    if (assignment.tier === "premium") return specificityScore > 50 ? 0.9 : 0.3;
    return 0.5;
  } catch {
    return 0.5;
  }
}
function computePoolMaxima(pool) {
  let maxCost = 1e-3;
  let maxLatency = 1;
  let maxStdDev = 1e-3;
  for (const p of pool) {
    if (p.costPer1MTokens > maxCost) maxCost = p.costPer1MTokens;
    if (p.p95LatencyMs > maxLatency) maxLatency = p.p95LatencyMs;
    if (p.latencyStdDev > maxStdDev) maxStdDev = p.latencyStdDev;
  }
  return { maxCost, maxLatency, maxStdDev };
}
function calculateFactors(candidate, pool, taskType, getTaskFitness, manifestHint, precomputedMaxima) {
  const { maxCost, maxLatency, maxStdDev } = precomputedMaxima ?? computePoolMaxima(pool);
  return {
    quota: clamp01(candidate.quotaRemaining / 100),
    health: candidate.circuitBreakerState === "CLOSED" ? 1 : candidate.circuitBreakerState === "HALF_OPEN" ? 0.5 : 0,
    costInv: clamp01(1 - candidate.costPer1MTokens / maxCost),
    latencyInv: clamp01(1 - candidate.p95LatencyMs / maxLatency),
    taskFit: clamp01(getTaskFitness(candidate.model, taskType)),
    stability: clamp01(1 - candidate.latencyStdDev / maxStdDev),
    tierPriority: calculateTierScore(candidate.accountTier, candidate.quotaResetIntervalSecs),
    tierAffinity: calculateTierAffinity(candidate, manifestHint),
    specificityMatch: calculateSpecificityMatch(candidate, manifestHint),
    contextAffinity: clamp01(candidate.contextAffinity ?? 0.5),
    cacheAffinity: clamp01(candidate.cacheAffinity ?? 0),
    sessionAvailability: clamp01(candidate.sessionAvailability ?? 1),
    resetWindowAffinity: clamp01(candidate.resetWindowAffinity ?? 0.5),
    connectionDensity: clamp01(((candidate.connectionPoolSize ?? 1) - 1) / 10),
    // Feedback quality signal; neutral 0.5 when the tracker has no data yet
    // (cold providers are neither boosted nor unfairly penalized).
    quality: clamp01(candidate.quality ?? 0.5)
  };
}
function scorePool(pool, taskType, weights = DEFAULT_WEIGHTS, getTaskFitness = () => 0.5, manifestHint) {
  const poolMaxima = computePoolMaxima(pool);
  return pool.map((candidate) => {
    const factors = calculateFactors(
      candidate,
      pool,
      taskType,
      getTaskFitness,
      manifestHint,
      poolMaxima
    );
    return {
      provider: candidate.provider,
      model: candidate.model,
      score: calculateScore(factors, weights),
      factors,
      connectionId: candidate.connectionId
    };
  }).sort((a, b) => b.score - a.score);
}
function validateWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) < 0.01;
}
export {
  DEFAULT_WEIGHTS,
  calculateFactors,
  calculateScore,
  calculateTierScore,
  computePoolMaxima,
  normalizeScoringWeights,
  scorePool,
  validateWeights
};
