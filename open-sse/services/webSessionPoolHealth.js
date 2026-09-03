import { PoolRegistry } from "./sessionPool/poolRegistry.js";
import {
  isProviderInCooldown,
  getProviderCooldownRemainingMs
} from "../utils/omni/accountFallbackExt.js";
import { getAllCircuitBreakerStatuses } from "../utils/omni/circuitBreaker.js";
const defaultDeps = {
  listProviders: () => PoolRegistry.listProviders(),
  getStats: (p) => PoolRegistry.getStats(p),
  getSessionDetails: (p) => PoolRegistry.getSessionDetails(p),
  isProviderInCooldown: (p) => isProviderInCooldown(p),
  getProviderCooldownRemainingMs: (p) => getProviderCooldownRemainingMs(p),
  getProviderBreakerState: (p) => {
    const statuses = getAllCircuitBreakerStatuses();
    const match = statuses.find((s) => s.name === p);
    if (!match) return null;
    return {
      state: match.state,
      failureCount: match.failureCount,
      lastFailureTime: match.lastFailureTime,
      retryAfterMs: match.retryAfterMs
    };
  }
};
function parsePercentString(value) {
  if (!value) return NaN;
  const num = parseFloat(value.replace("%", ""));
  return Number.isFinite(num) ? num : NaN;
}
function computeHealth(pool, breaker) {
  const issues = [];
  if (breaker?.inCooldown) {
    issues.push(
      `breaker OPEN (cooldown ${breaker.cooldownRemainingMs ?? 0}ms remaining)`
    );
    return { health: "down", issues };
  }
  if (pool) {
    if (pool.totalSessions > 0 && pool.activeSessions === 0 && pool.cooldownSessions === 0) {
      issues.push(`all ${pool.deadSessions} sessions dead`);
      return { health: "down", issues };
    }
    if (pool.totalRequests > 0) {
      const successRate = parsePercentString(pool.successRate);
      if (Number.isFinite(successRate) && successRate < 80) {
        issues.push(`success rate ${pool.successRate} below 80% threshold`);
      }
    }
    if (pool.totalSessions > 0) {
      const unhealthyRatio = (pool.cooldownSessions + pool.deadSessions) / pool.totalSessions;
      if (unhealthyRatio > 0.5) {
        issues.push(
          `${pool.cooldownSessions + pool.deadSessions}/${pool.totalSessions} sessions in cooldown/dead`
        );
      }
    }
    if (issues.length > 0) {
      return { health: "degraded", issues };
    }
  }
  return { health: "healthy", issues };
}
function buildPoolInfo(stats) {
  if (!stats) return null;
  const elapsedMs = Date.now() - stats.createdAt;
  return {
    totalSessions: stats.sessions.total,
    activeSessions: stats.sessions.active,
    cooldownSessions: stats.sessions.cooldown,
    deadSessions: stats.sessions.dead,
    totalRequests: stats.requests.total,
    successfulRequests: stats.requests.success,
    successRate: stats.successRate,
    throughput: stats.throughput,
    uptime: formatDuration(elapsedMs)
  };
}
function buildBreakerInfo(provider, deps) {
  const breakerState = deps.getProviderBreakerState(provider);
  if (!breakerState) return null;
  const inCooldown = deps.isProviderInCooldown(provider);
  const cooldownRemainingMs = deps.getProviderCooldownRemainingMs(provider);
  return {
    state: breakerState.state ?? "UNKNOWN",
    inCooldown,
    cooldownRemainingMs,
    failureCount: breakerState.failureCount ?? 0,
    lastFailureAt: breakerState.lastFailureTime ?? null
  };
}
function mapSessionDetails(details) {
  if (!details) return [];
  return details.map((d) => ({
    id: d.id,
    fingerprint: d.fingerprint,
    status: d.status,
    totalRequests: d.totalRequests,
    successfulRequests: d.successfulRequests,
    successRate: d.successRate,
    inflight: d.inflight,
    cooldownRemaining: d.cooldownRemaining,
    age: d.age
  }));
}
function formatDuration(ms) {
  if (ms <= 0) return "none";
  const seconds = Math.floor(ms / 1e3);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  if (remainMins === 0) return `${hours}h`;
  return `${hours}h ${remainMins}m`;
}
function getWebSessionPoolHealth(provider, deps = defaultDeps) {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const providers = provider ? [provider] : deps.listProviders();
  const results = providers.map((p) => {
    const stats = deps.getStats(p);
    const sessionDetails = deps.getSessionDetails(p);
    const poolInfo = buildPoolInfo(stats);
    const breakerInfo = buildBreakerInfo(p, deps);
    const sessions = mapSessionDetails(sessionDetails);
    const { health, issues } = computeHealth(poolInfo, breakerInfo);
    return {
      provider: p,
      pool: poolInfo,
      breaker: breakerInfo,
      sessions,
      health,
      issues
    };
  });
  return { checkedAt, providers: results };
}
export {
  getWebSessionPoolHealth
};
