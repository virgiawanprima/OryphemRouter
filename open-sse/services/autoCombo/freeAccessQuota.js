import {
  getUsageForProvider,
  USAGE_FETCHER_PROVIDERS
} from "../../utils/omni/usageFetcher.js";
import { getCachedProviderConnections } from "../../utils/omni/readCacheConnections.js";
import { defaultLogger as log } from "../../utils/omni/loggerDefault.js";
const USAGE_FETCHER_PROVIDER_SET = new Set(USAGE_FETCHER_PROVIDERS);
const FALLBACK_TTL_MS = 18e4;
const MAX_CONCURRENT_REFRESHES = 4;
const HARD_EVICTION_AGE_MS = FALLBACK_TTL_MS * 20;
const SWEEP_EVERY_N_CALLS = 200;
const cache = /* @__PURE__ */ new Map();
const inFlight = /* @__PURE__ */ new Set();
let resolveCallCount = 0;
function cacheKey(provider, connectionId) {
  return `${provider}::${connectionId}`;
}
function ttlMs() {
  return FALLBACK_TTL_MS;
}
function sweepIfDue() {
  resolveCallCount += 1;
  if (resolveCallCount % SWEEP_EVERY_N_CALLS !== 0) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.fetchedAtMs > HARD_EVICTION_AGE_MS) cache.delete(key);
  }
}
function extractRemainingAllowance(usage) {
  if (!usage || typeof usage !== "object") return null;
  const quotas = usage.quotas;
  if (!quotas || typeof quotas !== "object") return null;
  let worstPercent = null;
  for (const raw of Object.values(quotas)) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw;
    if (q.unlimited === true) continue;
    let pct = typeof q.remainingPercentage === "number" ? q.remainingPercentage : null;
    if (pct === null && typeof q.total === "number" && typeof q.remaining === "number" && q.total > 0) {
      pct = 100 * q.remaining / q.total;
    }
    if (pct === null) continue;
    worstPercent = worstPercent === null ? pct : Math.min(worstPercent, pct);
  }
  return worstPercent;
}
async function refresh(provider, connectionId) {
  const key = cacheKey(provider, connectionId);
  if (inFlight.has(key)) return;
  if (inFlight.size >= MAX_CONCURRENT_REFRESHES) return;
  inFlight.add(key);
  try {
    const connections = await getCachedProviderConnections();
    const connection = connections.find(
      (c) => !!c && typeof c === "object" && c.id === connectionId && c.provider === provider
    );
    if (!connection) {
      cache.delete(key);
      return;
    }
    const usage = await getUsageForProvider(
      connection,
      { forceRefresh: false }
    );
    const remaining = extractRemainingAllowance(usage);
    const state = {
      status: remaining === null ? "UNKNOWN" : remaining > 0 ? "SAFE" : "EXHAUSTED",
      remainingFreeAllowance: remaining,
      resetAt: usage && typeof usage === "object" && typeof usage.resetAt === "string" ? usage.resetAt : null,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    cache.set(key, { state, fetchedAtMs: Date.now() });
  } catch (err) {
    cache.delete(key);
    log.warn("AUTO", "STRICT_ZERO_COST: usage refresh failed, treating as UNKNOWN", {
      provider,
      err: err instanceof Error ? err.message : String(err)
    });
  } finally {
    inFlight.delete(key);
  }
}
function resolveFreeAccessState(provider, connectionId) {
  sweepIfDue();
  if (!USAGE_FETCHER_PROVIDER_SET.has(provider)) return void 0;
  if (!connectionId) return void 0;
  const key = cacheKey(provider, connectionId);
  const entry = cache.get(key);
  const fresh = entry && Date.now() - entry.fetchedAtMs <= ttlMs();
  if (!fresh) {
    void refresh(provider, connectionId);
  }
  return fresh ? entry.state : void 0;
}
function invalidateFreeAccessState(provider, connectionId) {
  cache.delete(cacheKey(provider, connectionId));
}
const __testing = { cache, extractRemainingAllowance, sweepIfDue };
export {
  __testing,
  invalidateFreeAccessState,
  resolveFreeAccessState
};
