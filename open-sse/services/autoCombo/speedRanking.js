const DEFAULT_SPEED_WEIGHTS = {
  ttft: 0.25,
  tps: 0.2,
  e2e: 0.18,
  p95: 0.12,
  health: 0.05,
  reliability: 0.15,
  stability: 0.05
};
const FACTOR_LABEL = {
  ttft: "ttft",
  tps: "tps",
  e2e: "e2e",
  p95: "p95",
  health: "health",
  reliability: "reliability",
  stability: "stability"
};
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
function positiveFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function toBoundedRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}
function poolMax(values, readMetric, floor = 1) {
  let max = floor;
  for (const value of values) {
    const v = readMetric(value);
    if (v != null && v > max) max = v;
  }
  return max;
}
function poolMaxHigherBetter(values, readMetric, floor = 1e-6) {
  let max = floor;
  for (const value of values) {
    const v = readMetric(value);
    if (v != null && v > max) max = v;
  }
  return max;
}
function lowerIsBetter(value, max) {
  if (value == null) return 0.5;
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 1;
  return clamp01(1 - value / max);
}
function higherIsBetter(value, max) {
  if (value == null) return 0.5;
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return clamp01(value / max);
}
function healthScoreFor(state) {
  if (state === "CLOSED") return 1;
  if (state === "HALF_OPEN") return 0.5;
  return 0;
}
function speedPoolMaxima(pool) {
  return {
    ttft: poolMax(pool, (c) => positiveFinite(c.avgTtftMs) ?? positiveFinite(c.p95LatencyMs)),
    e2e: poolMax(pool, (c) => positiveFinite(c.avgE2ELatencyMs) ?? positiveFinite(c.p95LatencyMs)),
    p95: poolMax(pool, (c) => positiveFinite(c.p95LatencyMs)),
    tps: poolMaxHigherBetter(pool, (c) => positiveFinite(c.avgTokensPerSecond)),
    stdDev: poolMax(pool, (c) => positiveFinite(c.latencyStdDev), 1e-3)
  };
}
function speedFactorsFor(candidate, maxima, failureRate) {
  return {
    ttft: lowerIsBetter(
      positiveFinite(candidate.avgTtftMs) ?? positiveFinite(candidate.p95LatencyMs),
      maxima.ttft
    ),
    tps: higherIsBetter(positiveFinite(candidate.avgTokensPerSecond), maxima.tps),
    e2e: lowerIsBetter(
      positiveFinite(candidate.avgE2ELatencyMs) ?? positiveFinite(candidate.p95LatencyMs),
      maxima.e2e
    ),
    p95: lowerIsBetter(positiveFinite(candidate.p95LatencyMs), maxima.p95),
    health: healthScoreFor(candidate.circuitBreakerState),
    reliability: clamp01(1 - failureRate),
    stability: lowerIsBetter(positiveFinite(candidate.latencyStdDev), maxima.stdDev)
  };
}
function weightedSpeedScore(factors, weights) {
  return factors.ttft * weights.ttft + factors.tps * weights.tps + factors.e2e * weights.e2e + factors.p95 * weights.p95 + factors.health * weights.health + factors.reliability * weights.reliability + factors.stability * weights.stability;
}
function applySpeedPenalties(weightedSum, factors) {
  const reliabilityMultiplier = Math.max(0.05, Math.pow(0.25 + 0.75 * factors.reliability, 2));
  const stabilityMultiplier = Math.max(0.05, Math.pow(0.25 + 0.75 * factors.stability, 2));
  return clamp01(weightedSum * reliabilityMultiplier * stabilityMultiplier * Math.max(0.25, factors.health));
}
function speedReason(candidate, factors, metrics) {
  const reasonParts = [
    `ttft=${metrics.avgTtftMs == null ? "n/a" : `${Math.round(metrics.avgTtftMs)}ms`}`,
    `tps=${metrics.avgTokensPerSecond == null ? "n/a" : metrics.avgTokensPerSecond.toFixed(1)}`,
    `e2e=${metrics.avgE2ELatencyMs == null ? "n/a" : `${Math.round(metrics.avgE2ELatencyMs)}ms`}`,
    `p95=${metrics.p95LatencyMs == null ? "n/a" : `${Math.round(metrics.p95LatencyMs)}ms`}`,
    `failRate=${(metrics.failureRate * 100).toFixed(2)}%`,
    `cb=${candidate.circuitBreakerState}`
  ];
  return `SpeedRanking[${FACTOR_LABEL.ttft}=${factors.ttft.toFixed(2)}, ${FACTOR_LABEL.tps}=${factors.tps.toFixed(2)}, ${FACTOR_LABEL.e2e}=${factors.e2e.toFixed(2)}, ${FACTOR_LABEL.p95}=${factors.p95.toFixed(2)}, ${FACTOR_LABEL.reliability}=${factors.reliability.toFixed(2)}, ${FACTOR_LABEL.health}=${factors.health.toFixed(2)}, ${FACTOR_LABEL.stability}=${factors.stability.toFixed(2)}] \u2192 ${reasonParts.join(", ")}`;
}
function rankBySpeed(candidates, weights = DEFAULT_SPEED_WEIGHTS, options = {}) {
  if (candidates.length === 0) return [];
  const pool = options.includeUnhealthy ? [...candidates] : candidates.filter((c) => c.circuitBreakerState !== "OPEN");
  if (pool.length === 0) return [];
  const maxima = speedPoolMaxima(pool);
  const ranked = pool.map((candidate) => {
    const p95 = positiveFinite(candidate.p95LatencyMs);
    const ttft = positiveFinite(candidate.avgTtftMs);
    const e2e = positiveFinite(candidate.avgE2ELatencyMs);
    const tps = positiveFinite(candidate.avgTokensPerSecond);
    const stdDev = positiveFinite(candidate.latencyStdDev);
    const failureRate = toBoundedRate(
      candidate.failureRate ?? (typeof candidate.errorRate === "number" ? candidate.errorRate : 0)
    );
    const factors = speedFactorsFor(candidate, maxima, failureRate);
    const score = applySpeedPenalties(weightedSpeedScore(factors, weights), factors);
    const metrics = {
      avgTtftMs: ttft,
      avgTokensPerSecond: tps,
      avgE2ELatencyMs: e2e,
      p95LatencyMs: p95,
      latencyStdDev: stdDev,
      failureRate,
      circuitBreakerState: candidate.circuitBreakerState
    };
    return {
      provider: candidate.provider,
      model: candidate.model,
      score,
      factors,
      metrics,
      reason: speedReason(candidate, factors, metrics)
    };
  });
  return ranked.sort((a, b) => b.score - a.score);
}
function pickFastest(candidates, weights = DEFAULT_SPEED_WEIGHTS) {
  const ranked = rankBySpeed(candidates, weights);
  return ranked.length > 0 ? ranked[0] : null;
}
export {
  DEFAULT_SPEED_WEIGHTS,
  pickFastest,
  rankBySpeed
};
