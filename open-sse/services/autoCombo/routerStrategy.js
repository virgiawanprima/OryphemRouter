import { scorePool } from "./scoring.js";
import { getTaskFitness } from "./taskFitness.js";
import { clamp01 } from "../../utils/number.js";
import { rankBySpeed } from "./speedRanking.js";
import { log as engineLog } from "../../utils/log.js";
function toSpeedCandidate(c) {
  return {
    // Identity
    provider: c.provider,
    model: c.model,
    // Resource state
    quotaRemaining: c.quotaRemaining,
    quotaTotal: c.quotaTotal,
    circuitBreakerState: c.circuitBreakerState,
    // Costs
    costPer1MTokens: c.costPer1MTokens,
    // Latency metrics
    p95LatencyMs: c.p95LatencyMs,
    avgTtftMs: c.avgTtftMs,
    avgE2ELatencyMs: c.avgE2ELatencyMs,
    avgTokensPerSecond: c.avgTokensPerSecond,
    latencyStdDev: c.latencyStdDev,
    // Reliability
    errorRate: c.errorRate,
    failureRate: c.failureRate,
    // Tier signals (forwarded so weights stay available for downstream tuning)
    accountTier: c.accountTier,
    quotaResetIntervalSecs: c.quotaResetIntervalSecs,
    contextAffinity: c.contextAffinity,
    resetWindowAffinity: c.resetWindowAffinity,
    connectionPoolSize: c.connectionPoolSize,
    connectionId: c.connectionId
  };
}
class RulesStrategyImpl {
  name = "rules";
  description = "6-factor weighted scoring: quota, health, cost, latency, taskFit, stability";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const ranked = scorePool(
      eligible.length > 0 ? eligible : pool,
      context.taskType,
      void 0,
      getTaskFitness
    );
    const best = ranked[0];
    if (!best) throw new Error("[RulesStrategy] No candidates to score");
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `RulesStrategy: score=${best.score.toFixed(3)} (quota=${best.factors.quota.toFixed(2)}, health=${best.factors.health.toFixed(2)}, cost=${best.factors.costInv.toFixed(2)}, taskFit=${best.factors.taskFit.toFixed(2)})`,
      candidatesConsidered: ranked.length,
      finalScore: best.score,
      connectionId: best.connectionId
    };
  }
}
class CostStrategyImpl {
  name = "cost";
  description = "Always selects cheapest available provider (by costPer1MTokens)";
  select(pool, context) {
    const healthy = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = healthy.length > 0 ? healthy : pool;
    const sorted = [...candidates].sort((a, b) => a.costPer1MTokens - b.costPer1MTokens);
    const best = sorted[0];
    if (!best) throw new Error("[CostStrategy] No candidates available");
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `CostStrategy: cheapest at $${best.costPer1MTokens.toFixed(3)}/1M tokens`,
      candidatesConsidered: candidates.length,
      finalScore: best.costPer1MTokens === 0 ? 1 : 1 / best.costPer1MTokens
    };
  }
}
class LatencyStrategyImpl {
  name = "latency";
  description = "Prioritizes the fastest reliable provider-model pair using TTFT, TPS, E2E latency, health, fail rate, and stability";
  select(pool, context) {
    const ranked = rankBySpeed(pool.map(toSpeedCandidate));
    const winner = ranked[0];
    if (!winner) {
      throw new Error("[LatencyStrategy] No candidates available after speed ranking");
    }
    return {
      provider: winner.provider,
      model: winner.model,
      strategy: this.name,
      reason: latencyDecisionReason(winner),
      candidatesConsidered: ranked.length,
      finalScore: winner.score
    };
  }
}
function metricString(value, digits = 0) {
  return value == null ? "n/a" : value.toFixed(digits);
}
function latencyDecisionReason(winner) {
  const metrics = winner.metrics;
  const e2e = metrics.avgE2ELatencyMs ?? metrics.p95LatencyMs;
  return `LatencyStrategy(score=${winner.score.toFixed(3)}): ttft=${metricString(metrics.avgTtftMs)}ms tps=${metricString(metrics.avgTokensPerSecond, 1)} e2e=${metricString(e2e)}ms p95=${metricString(metrics.p95LatencyMs)}ms failRate=${((metrics.failureRate ?? 0) * 100).toFixed(2)}% stability=${metricString(metrics.latencyStdDev)}ms cb=${metrics.circuitBreakerState ?? "n/a"}`;
}
const DEFAULT_SLA_TARGET_P95_MS = 2e3;
const DEFAULT_SLA_MAX_ERROR_RATE = 0.05;
function toPositiveFinite(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : void 0;
}
function toFiniteRate(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.min(1, numericValue) : void 0;
}
function inverseNormalized(value, maxValue) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;
  return clamp01(1 - value / maxValue);
}
function scoreAtOrBelowThreshold(value, threshold) {
  if (threshold <= 0) return value === 0 ? 1 : 0;
  return clamp01(threshold / Math.max(value, 1e-6));
}
function getHealthScore(candidate) {
  if (candidate.circuitBreakerState === "CLOSED") return 1;
  if (candidate.circuitBreakerState === "HALF_OPEN") return 0.5;
  return 0;
}
function getSlaViolationScore(candidate, policy) {
  let violation = candidate.circuitBreakerState === "OPEN" ? 1 : 0;
  if (candidate.p95LatencyMs > policy.targetP95Ms) {
    violation += (candidate.p95LatencyMs - policy.targetP95Ms) / policy.targetP95Ms;
  }
  if (candidate.errorRate > policy.maxErrorRate) {
    violation += policy.maxErrorRate > 0 ? (candidate.errorRate - policy.maxErrorRate) / policy.maxErrorRate : candidate.errorRate;
  }
  if (policy.maxCostPer1MTokens > 0 && candidate.costPer1MTokens > policy.maxCostPer1MTokens) {
    violation += (candidate.costPer1MTokens - policy.maxCostPer1MTokens) / policy.maxCostPer1MTokens;
  }
  return violation;
}
class SLAStrategyImpl {
  name = "sla-aware";
  description = "Selects the provider most likely to satisfy latency, error-rate, and cost SLOs";
  select(pool, context) {
    const healthy = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = healthy.length > 0 ? healthy : pool;
    if (candidates.length === 0) throw new Error("[SLAStrategy] No candidates available");
    const maxCost = Math.max(...candidates.map((c) => c.costPer1MTokens), 1e-3);
    const maxStdDev = Math.max(...candidates.map((c) => c.latencyStdDev), 1e-3);
    const policy = {
      targetP95Ms: toPositiveFinite(context.sla?.targetP95Ms) ?? DEFAULT_SLA_TARGET_P95_MS,
      maxErrorRate: toFiniteRate(context.sla?.maxErrorRate) ?? DEFAULT_SLA_MAX_ERROR_RATE,
      maxCostPer1MTokens: toPositiveFinite(context.sla?.maxCostPer1MTokens) ?? 0,
      hardConstraints: context.sla?.hardConstraints === true
    };
    const scored = candidates.map((candidate) => {
      const latencyScore = scoreAtOrBelowThreshold(candidate.p95LatencyMs, policy.targetP95Ms);
      const errorScore = scoreAtOrBelowThreshold(candidate.errorRate, policy.maxErrorRate);
      const costScore = policy.maxCostPer1MTokens > 0 ? scoreAtOrBelowThreshold(candidate.costPer1MTokens, policy.maxCostPer1MTokens) : inverseNormalized(candidate.costPer1MTokens, maxCost);
      const stabilityScore = inverseNormalized(candidate.latencyStdDev, maxStdDev);
      const healthScore = getHealthScore(candidate);
      const violationScore = getSlaViolationScore(candidate, policy);
      return {
        candidate,
        violationScore,
        score: latencyScore * 0.35 + errorScore * 0.35 + healthScore * 0.15 + costScore * 0.1 + stabilityScore * 0.05
      };
    }).sort((a, b) => {
      if (policy.hardConstraints) {
        return a.violationScore - b.violationScore || b.score - a.score;
      }
      return b.score - a.score;
    });
    const best = scored[0];
    if (!best) throw new Error("[SLAStrategy] No candidates available after scoring");
    const anyCompliant = scored.some((entry) => entry.violationScore === 0);
    const fallbackNote = !anyCompliant ? "; no candidate met all SLA constraints" : "";
    return {
      provider: best.candidate.provider,
      model: best.candidate.model,
      strategy: this.name,
      reason: `SLAStrategy: p95=${best.candidate.p95LatencyMs}ms/${policy.targetP95Ms}ms, errorRate=${(best.candidate.errorRate * 100).toFixed(2)}%/${(policy.maxErrorRate * 100).toFixed(2)}%, cost=$${best.candidate.costPer1MTokens.toFixed(3)}/1M${fallbackNote}`,
      candidatesConsidered: candidates.length,
      finalScore: best.score
    };
  }
}
class LKGPStrategyImpl {
  name = "lkgp";
  description = "Tries last known good provider first, then falls back to rules";
  select(pool, context) {
    if (context.lkgpEnabled === false) {
      return getStrategy("rules").select(pool, context);
    }
    if (context.lastKnownGoodProvider) {
      const candidates = pool.filter(
        (c) => c.provider === context.lastKnownGoodProvider && c.circuitBreakerState !== "OPEN"
      );
      if (candidates.length > 0) {
        const best = candidates[0];
        return {
          provider: best.provider,
          model: best.model,
          strategy: this.name,
          reason: `LKGP: using last known good provider ${best.provider}`,
          candidatesConsidered: 1,
          finalScore: 1
        };
      }
    }
    return getStrategy("rules").select(pool, context);
  }
}
const strategyRegistry = /* @__PURE__ */ new Map();
const rulesStrategy = new RulesStrategyImpl();
const costStrategy = new CostStrategyImpl();
const latencyStrategy = new LatencyStrategyImpl();
const slaStrategy = new SLAStrategyImpl();
const lkgpStrategy = new LKGPStrategyImpl();

// ── Deterministic strategies (OmniRoute "combo strategies" port) ─────────────
class WeightedStrategyImpl {
  name = "weighted";
  description = "Weighted random by per-target weight";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const totalWeight = candidates.reduce((sum, c) => sum + Math.max(0, Number(c.weight) || 1), 0);
    if (totalWeight <= 0) return new RulesStrategyImpl().select(pool, context);
    let roll = Math.random() * totalWeight;
    for (const c of candidates) {
      roll -= Math.max(0, Number(c.weight) || 1);
      if (roll <= 0) {
        return {
          provider: c.provider,
          model: c.model,
          strategy: this.name,
          reason: `WeightedStrategy: weighted-random pick (weight=${c.weight ?? 1}, total=${totalWeight.toFixed(1)})`,
          candidatesConsidered: candidates.length,
          finalScore: (Math.max(0, Number(c.weight) || 1)) / totalWeight,
          connectionId: c.connectionId,
        };
      }
    }
    // Floating-point roll can land just above 0 after the final weight; pick the
    // last candidate instead of returning undefined.
    const last = candidates[candidates.length - 1];
    return {
      provider: last.provider,
      model: last.model,
      strategy: this.name,
      reason: `WeightedStrategy: weighted-random pick (rounding fallback)`,
      candidatesConsidered: candidates.length,
      finalScore: (Math.max(0, Number(last.weight) || 1)) / totalWeight,
      connectionId: last.connectionId,
    };
  }
}
class LeastUsedStrategyImpl {
  name = "least-used";
  description = "Pick the target with the lowest current load";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const sorted = [...candidates].sort((a, b) => (a.currentLoad ?? 0) - (b.currentLoad ?? 0));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `LeastUsedStrategy: lowest load ${best.currentLoad ?? 0}`,
      candidatesConsidered: candidates.length,
      finalScore: sorted.length > 1 ? 1 - (best.currentLoad ?? 0) / Math.max(1, (sorted.at(-1).currentLoad ?? 0)) : 1,
      connectionId: best.connectionId,
    };
  }
}
class HeadroomStrategyImpl {
  name = "headroom";
  description = "Pick the target with the most remaining quota";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const sorted = [...candidates].sort((a, b) => (b.headroomRemaining ?? 0) - (a.headroomRemaining ?? 0));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `HeadroomStrategy: most quota remaining ${best.headroomRemaining ?? 0}`,
      candidatesConsidered: candidates.length,
      finalScore: best.headroomRemaining ?? 0,
      connectionId: best.connectionId,
    };
  }
}
class P2CStrategyImpl {
  name = "p2c";
  description = "Power-of-two-choices random load balancing";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    if (candidates.length < 2) {
      const [only] = candidates;
      if (!only) return new RulesStrategyImpl().select(pool, context);
      return {
        provider: only.provider,
        model: only.model,
        strategy: this.name,
        reason: "P2CStrategy: single candidate",
        candidatesConsidered: 1,
        finalScore: 1,
        connectionId: only.connectionId,
      };
    }
    const a = candidates[Math.floor(Math.random() * candidates.length)];
    let b = candidates[Math.floor(Math.random() * candidates.length)];
    if (b === a) b = candidates[(candidates.indexOf(a) + 1) % candidates.length];
    const pick = (a.currentLoad ?? 0) <= (b.currentLoad ?? 0) ? a : b;
    return {
      provider: pick.provider,
      model: pick.model,
      strategy: this.name,
      reason: `P2CStrategy: lower load of two random picks (load=${pick.currentLoad ?? 0})`,
      candidatesConsidered: candidates.length,
      finalScore: 1 - Math.min(1, (pick.currentLoad ?? 0) / 100),
      connectionId: pick.connectionId,
    };
  }
}
class RandomStrategyImpl {
  name = "random";
  description = "Uniform random pick (deduplicated)";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: pick.provider,
      model: pick.model,
      strategy: this.name,
      reason: "RandomStrategy: uniform random pick",
      candidatesConsidered: candidates.length,
      finalScore: 1 / candidates.length,
      connectionId: pick.connectionId,
    };
  }
}
const weightedStrategy = new WeightedStrategyImpl();
const leastUsedStrategy = new LeastUsedStrategyImpl();
const headroomStrategy = new HeadroomStrategyImpl();
const p2cStrategy = new P2CStrategyImpl();
const randomStrategy = new RandomStrategyImpl();

// ── Deterministic batch 2 (OmniRoute combo strategies) ──────────────────────
class FillFirstStrategyImpl {
  name = "fill-first";
  description = "Fill each target's quota fully before moving on";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    // Prefer the target with the most remaining quota headroom (fill it first).
    const sorted = [...candidates].sort((a, b) => (b.headroomRemaining ?? 0) - (a.headroomRemaining ?? 0));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `FillFirstStrategy: most quota headroom ${best.headroomRemaining ?? 0}`,
      candidatesConsidered: candidates.length,
      finalScore: best.headroomRemaining ?? 0,
      connectionId: best.connectionId,
    };
  }
}
class StrictRandomStrategyImpl {
  name = "strict-random";
  description = "Random without de-duplicating repeats";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: pick.provider,
      model: pick.model,
      strategy: this.name,
      reason: "StrictRandomStrategy: uniform random (repeats allowed)",
      candidatesConsidered: candidates.length,
      finalScore: 1 / candidates.length,
      connectionId: pick.connectionId,
    };
  }
}
class ResetWindowStrategyImpl {
  name = "reset-window";
  description = "Prefer the target whose quota window resets soonest";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const sorted = [...candidates].sort((a, b) => Number(a.quotaResetIntervalSecs ?? 0) - Number(b.quotaResetIntervalSecs ?? 0));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `ResetWindowStrategy: soonest reset (${best.quotaResetIntervalSecs ?? 0}s)`,
      candidatesConsidered: candidates.length,
      finalScore: best.quotaResetIntervalSecs === 0 ? 1 : 1 / Number(best.quotaResetIntervalSecs ?? 1),
      connectionId: best.connectionId,
    };
  }
}
class ResetAwareStrategyImpl {
  name = "reset-aware";
  description = "Rank by quota reset time — short windows first";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    const sorted = [...candidates].sort((a, b) => (b.resetWindowAffinity ?? 0) - (a.resetWindowAffinity ?? 0));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `ResetAwareStrategy: shortest reset window (affinity=${best.resetWindowAffinity ?? 0})`,
      candidatesConsidered: candidates.length,
      finalScore: best.resetWindowAffinity ?? 0,
      connectionId: best.connectionId,
    };
  }
}
class CacheOptimizedStrategyImpl {
  name = "cache-optimized";
  description = "Pin each reusable prompt prefix to the same account — maximize prompt-cache hits";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    // Max cache/context affinity so the same account reuses prompt-cache hits.
    const affinity = (c) => Number(c.cacheAffinity ?? c.contextAffinity ?? 0);
    const sorted = [...candidates].sort((a, b) => affinity(b) - affinity(a));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `CacheOptimizedStrategy: max cache affinity (${affinity(best)})`,
      candidatesConsidered: candidates.length,
      finalScore: affinity(best),
      connectionId: best.connectionId,
    };
  }
}
const fillFirstStrategy = new FillFirstStrategyImpl();
const strictRandomStrategy = new StrictRandomStrategyImpl();
const resetWindowStrategy = new ResetWindowStrategyImpl();
const resetAwareStrategy = new ResetAwareStrategyImpl();
const cacheOptimizedStrategy = new CacheOptimizedStrategyImpl();

// ── Context strategies (OmniRoute combo strategies) ─────────────────────────
class ContextRelayStrategyImpl {
  name = "context-relay";
  description = "Hand off context across targets for long conversations";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    // Prefer the target that already holds session context (highest context affinity
    // or the largest connection pool) so a long conversation stays on one provider.
    const affinity = (c) => Number(c.contextAffinity ?? 0) + (c.connectionPoolSize ?? 0) * 0.01;
    const sorted = [...candidates].sort((a, b) => affinity(b) - affinity(a));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `ContextRelayStrategy: context affinity ${Number(best.contextAffinity ?? 0)} (cc=${best.connectionPoolSize ?? 0})`,
      candidatesConsidered: candidates.length,
      finalScore: affinity(best),
      connectionId: best.connectionId,
    };
  }
}
class ContextOptimizedStrategyImpl {
  name = "context-optimized";
  description = "Pick the best fit for the current context size";
  select(pool, context) {
    const eligible = pool.filter((c) => c.circuitBreakerState !== "OPEN");
    const candidates = eligible.length > 0 ? eligible : pool;
    // Rate each candidate by how close its context window fits the request;
    // prefer the smallest window that still covers the required context.
    const requiredMsgs = context?.messages?.length ?? 0;
    const fit = (c) => {
      const win = Number(c.maxContextTokens ?? c.contextWindow ?? 1e6);
      if (requiredMsgs === 0) return Math.min(win, 1e6) / 1e6;
      return win >= requiredMsgs ? Math.min(1, win / 1e6) : 0;
    };
    const sorted = [...candidates].sort((a, b) => fit(b) - fit(a));
    const best = sorted[0];
    if (!best) return new RulesStrategyImpl().select(pool, context);
    return {
      provider: best.provider,
      model: best.model,
      strategy: this.name,
      reason: `ContextOptimizedStrategy: best context fit (msgs=${requiredMsgs})`,
      candidatesConsidered: candidates.length,
      finalScore: fit(best),
      connectionId: best.connectionId,
    };
  }
}
const contextRelayStrategy = new ContextRelayStrategyImpl();
const contextOptimizedStrategy = new ContextOptimizedStrategyImpl();
strategyRegistry.set("rules", rulesStrategy);
strategyRegistry.set("cost", costStrategy);
strategyRegistry.set("eco", costStrategy);
strategyRegistry.set("latency", latencyStrategy);
strategyRegistry.set("fast", latencyStrategy);
strategyRegistry.set("sla-aware", slaStrategy);
strategyRegistry.set("sla", slaStrategy);
strategyRegistry.set("lkgp", lkgpStrategy);
strategyRegistry.set("weighted", weightedStrategy);
strategyRegistry.set("least-used", leastUsedStrategy);
strategyRegistry.set("headroom", headroomStrategy);
strategyRegistry.set("p2c", p2cStrategy);
strategyRegistry.set("random", randomStrategy);
strategyRegistry.set("fill-first", fillFirstStrategy);
strategyRegistry.set("strict-random", strictRandomStrategy);
strategyRegistry.set("reset-window", resetWindowStrategy);
strategyRegistry.set("reset-aware", resetAwareStrategy);
strategyRegistry.set("cache-optimized", cacheOptimizedStrategy);
strategyRegistry.set("context-relay", contextRelayStrategy);
strategyRegistry.set("context-optimized", contextOptimizedStrategy);
function getStrategy(name) {
  const strategy = strategyRegistry.get(name);
  if (!strategy) {
    engineLog.warn("AUTO-COMBO", `Strategy '${name}' not found, falling back to 'rules'`);
    return rulesStrategy;
  }
  return strategy;
}
function registerStrategy(name, strategy) {
  if (strategyRegistry.has(name)) {
    engineLog.warn("AUTO-COMBO", `Overwriting strategy '${name}'`);
  }
  strategyRegistry.set(name, strategy);
}
function listStrategies() {
  return [...strategyRegistry.entries()].map(([name, s]) => ({ name, description: s.description }));
}
function selectWithStrategy(pool, context, strategyName = "rules") {
  return getStrategy(strategyName).select(pool, context);
}
export {
  getStrategy,
  listStrategies,
  registerStrategy,
  selectWithStrategy
};
