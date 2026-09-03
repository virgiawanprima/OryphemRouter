import { log } from "../utils/logger.js";
const state = /* @__PURE__ */ new Map();
const DEFAULT_CONFIG = {
  // 500ms is enough to prevent the burst-sensitive WAF from activating
  // while staying well below human perception of latency.
  minGapMs: 500
};
let config = { ...DEFAULT_CONFIG };
function configureWafRateLimit(overrides) {
  config = { ...config, ...overrides };
}
function getWafRateLimitConfig() {
  return { ...config };
}
async function gateOutboundRequest(bucketKey) {
  const now = Date.now();
  const bucket = state.get(bucketKey);
  if (!bucket) {
    state.set(bucketKey, { lastSentAt: now });
    return;
  }
  const elapsed = now - bucket.lastSentAt;
  const wait = config.minGapMs - elapsed;
  if (wait > 0) {
    log?.debug?.(
      "WAF_RATE_LIMIT",
      `Throttling outbound to ${bucketKey} \u2014 waiting ${wait}ms (min gap ${config.minGapMs}ms)`
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  state.set(bucketKey, { lastSentAt: Date.now() });
}
function resetWafRateLimit() {
  state.clear();
}
export {
  configureWafRateLimit,
  gateOutboundRequest,
  getWafRateLimitConfig,
  resetWafRateLimit
};
