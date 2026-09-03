// ADAPTED STUB — OmniRoute src/shared/constants/routingStrategies.ts (value subset).
export const ROUTING_STRATEGY_VALUES = [
  "priority", "weighted", "round-robin", "context-relay", "fill-first", "p2c",
  "random", "least-used", "cost-optimized", "reset-aware", "reset-window",
  "headroom", "strict-random", "auto", "lkgp", "context-optimized",
  "cache-optimized", "fusion", "pipeline",
];
export const AUTO_ROUTING_STRATEGY_VALUES = [
  "rules", "cost", "eco", "latency", "fast", "sla-aware", "sla", "lkgp",
];
export function normalizeRoutingStrategy(value) {
  const s = String(value || "").toLowerCase().trim();
  return ROUTING_STRATEGY_VALUES.includes(s) ? s : null;
}
