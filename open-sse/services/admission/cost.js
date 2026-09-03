import {
  MAX_ADMISSION_COST_OR_LIMIT
} from "./types.js";
const DEFAULT_ADMISSION_COST_CONFIG = Object.freeze({
  baseCost: 1,
  bodyBytesPerUnit: 16384,
  tokensPerUnit: 1024,
  messagesPerUnit: 32,
  toolsPerUnit: 8,
  fanoutPerUnit: 1,
  streamingClassCost: 1,
  nonStreamingClassCost: 2,
  maxRequestCost: 1e3
});
function finiteNonNegative(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, Number.MAX_SAFE_INTEGER);
}
function requirePositiveSafeInteger(name, value, max = MAX_ADMISSION_COST_OR_LIMIT) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  if (value > max) {
    throw new RangeError(`${name} must be <= ${max}`);
  }
  return value;
}
const COST_CONFIG_KEYS = [
  "baseCost",
  "bodyBytesPerUnit",
  "tokensPerUnit",
  "messagesPerUnit",
  "toolsPerUnit",
  "fanoutPerUnit",
  "streamingClassCost",
  "nonStreamingClassCost",
  "maxRequestCost"
];
function resolveCostConfig(partial) {
  const d = DEFAULT_ADMISSION_COST_CONFIG;
  const resolved = {};
  for (const key of COST_CONFIG_KEYS) {
    resolved[key] = requirePositiveSafeInteger(key, partial?.[key] ?? d[key]);
  }
  return resolved;
}
function unitsFrom(amount, quantum) {
  return amount <= 0 ? 0 : Math.ceil(amount / quantum);
}
function addBounded(total, contribution, maximum) {
  if (contribution >= maximum - total) return maximum;
  return total + contribution;
}
function estimateAdmissionCost(features, config) {
  const cfg = resolveCostConfig(config);
  const body = finiteNonNegative(features?.bodyBytes);
  const tokens = finiteNonNegative(features?.estimatedInputTokens);
  const messages = finiteNonNegative(features?.messageCount);
  const tools = finiteNonNegative(features?.toolCount);
  const fanout = Math.max(1, finiteNonNegative(features?.requestedFanout));
  const contributions = [
    unitsFrom(body, cfg.bodyBytesPerUnit),
    unitsFrom(tokens, cfg.tokensPerUnit),
    unitsFrom(messages, cfg.messagesPerUnit),
    unitsFrom(tools, cfg.toolsPerUnit),
    unitsFrom(fanout, cfg.fanoutPerUnit),
    features?.streaming !== false ? cfg.streamingClassCost : cfg.nonStreamingClassCost
  ];
  let total = Math.min(cfg.baseCost, cfg.maxRequestCost);
  for (const contribution of contributions) {
    total = addBounded(total, contribution, cfg.maxRequestCost);
    if (total === cfg.maxRequestCost) break;
  }
  return total;
}
function normalizeRequestCost(cost, maxRequestCost = DEFAULT_ADMISSION_COST_CONFIG.maxRequestCost) {
  const max = requirePositiveSafeInteger("maxRequestCost", maxRequestCost);
  const value = requirePositiveSafeInteger("request cost", cost);
  return Math.min(value, max);
}
export {
  DEFAULT_ADMISSION_COST_CONFIG,
  MAX_ADMISSION_COST_OR_LIMIT,
  estimateAdmissionCost,
  normalizeRequestCost,
  resolveCostConfig
};
