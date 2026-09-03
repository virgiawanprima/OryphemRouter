import { MAX_TIMER_TIMEOUT_MS } from "../utils/omni/runtimeTimeoutsExtra.js";
const PRE_SCREEN_CONCURRENCY = 5;
const DEFAULT_COMBO_TARGET_TIMEOUT_MS = 12e4;
const COMBO_TARGET_TIMEOUT_WAIT_BUFFER_MS = 1e4;
function isComboCooldownWaitEligible(_strategy, comboCooldownWait) {
  return comboCooldownWait.enabled;
}
function resolveComboTargetTimeoutMsForCombo(config, upstreamTimeoutMs, strategy, comboCooldownWait) {
  const defaultTimeoutMs = isComboCooldownWaitEligible(strategy, comboCooldownWait) ? Math.max(
    DEFAULT_COMBO_TARGET_TIMEOUT_MS,
    comboCooldownWait.budgetMs + COMBO_TARGET_TIMEOUT_WAIT_BUFFER_MS
  ) : DEFAULT_COMBO_TARGET_TIMEOUT_MS;
  return resolveComboTargetTimeoutMs(config, upstreamTimeoutMs, defaultTimeoutMs);
}
const DEFAULT_COMBO_QUEUE_DEPTH = 20;
const MAX_COMBO_QUEUE_DEPTH = 100;
const DEFAULT_COMBO_CONFIG = {
  strategy: "priority",
  maxRetries: 1,
  retryDelayMs: 2e3,
  fallbackDelayMs: 0,
  // #9100: round-robin combo concurrency was hard-capped at 3 concurrent
  // requests per model with no override — 5 concurrent requests through a
  // round-robin combo serialized behind that cap. Now configurable via
  // COMBO_CONCURRENCY_PER_MODEL (validated to >= 1, clamped to <= 32; default
  // 3 preserves the historical behavior).
  concurrencyPerModel: Math.min(
    Math.max(Number(process.env.COMBO_CONCURRENCY_PER_MODEL) || 3, 1),
    32
  ),
  queueTimeoutMs: 12e4,
  // max wait time in semaphore queue (round-robin); raised from 30s for browser-automation providers like gemini-web (#9407)
  queueDepth: DEFAULT_COMBO_QUEUE_DEPTH,
  // pre-cascade semaphore queue depth (round-robin, #3872)
  handoffThreshold: 0.85,
  handoffModel: "",
  handoffProviders: ["codex"],
  maxMessagesForSummary: 30,
  maxComboDepth: 3,
  // #11134: shared per-request combo attempt budget. Previously the hardcoded
  // MAX_GLOBAL_ATTEMPTS with no override — operators could neither fail fast on
  // a dead pool nor raise it for large combos. Clamped by clampGlobalAttempts to
  // [1, MAX_GLOBAL_ATTEMPTS_HARD_CAP] at every read site.
  maxGlobalAttempts: 30,
  nestedComboMode: "flatten",
  trackMetrics: true,
  reasoningTokenBufferEnabled: true,
  manifestRouting: false,
  // Complexity-aware auto routing (2026): when on, the auto router scores
  // candidates by how well their tier matches the request's classified
  // difficulty (feeds tierAffinity/specificityMatch). Opt-in — off by default.
  complexityAwareRouting: false,
  resetAwareSessionWeight: 0.35,
  resetAwareWeeklyWeight: 0.65,
  resetAwareTieBandPercent: 5,
  resetAwareExhaustionGuardPercent: 10,
  // Historical default (predates #2417/#10217) — true. This value feeds TWO
  // independent mechanisms and must stay true-by-default for one of them:
  //   1. skipUpstreamRetry (src/sse/handlers/chat.ts:859,1126) — the
  //      lower-level executor retry skip. Always default-on; changing this
  //      default flips that mechanism's behavior for every combo, not just
  //      opted-in ones.
  //   2. The #10217 same-model retry guard in this file's combo.ts callers
  //      (priority/auto + round-robin loops) — meant to be OPT-IN only. That
  //      guard must NOT read this field directly; it consults the sibling
  //      `failoverBeforeRetryExplicit` flag computed below in
  //      resolveComboConfig/resolveComboSetupConfig, which is true only when
  //      an actual cascade layer (combo/provider/global) set the flag to
  //      true, not merely inherited from this default. See round-4 base-red
  //      bisect (06f41cda63 vs d2fd88dfbc) — flipping THIS default to false
  //      "fixed" mechanism 2 but silently broke mechanism 1's default-on
  //      behavior for every combo without an explicit opt-in.
  failoverBeforeRetry: true,
  // Feature 4985: configurable response-body validation predicate (per-combo). When set,
  // a 200 OK whose body fails the predicate fails over to the next target.
  responseValidation: void 0,
  maxSetRetries: 0,
  setRetryDelayMs: 2e3,
  // Zero-latency optimizations are opt-in because some modes can race targets or
  // mutate fallback request bodies for lower tail latency.
  zeroLatencyOptimizationsEnabled: false,
  // Hedging (Speculative Execution) defaults
  hedging: false,
  hedgeDelayMs: 500,
  // Mid-Stream Fallback Compression defaults
  fallbackCompressionMode: "lite",
  fallbackCompressionThreshold: 1e3,
  // Predictive TTFT Circuit Breaker defaults
  predictiveTtftMs: 0,
  // Pipeline defaults
  pipeline_enabled: false,
  task_detection: "pattern",
  max_reflection_loops: 1,
  skip_pipeline_for_tokens_under: 50,
  pipeline_fallback: "single-provider",
  resetAwareQuotaCacheTtlMs: 0,
  resetAwareQuotaCacheMaxStaleMs: 0,
  // Global combo timeout (0 = disabled). When set, limits the total wall-clock time
  // the combo spends iterating through targets. After each target completes, if the
  // elapsed time exceeds comboTimeoutMs, remaining targets are skipped and a 504 with
  // aggregated error diagnostics is returned. Backward-compatible: 0 preserves the
  // legacy unlimited-iteration behavior.
  comboTimeoutMs: 0,
  shadowRouting: {
    enabled: false,
    targets: [],
    sampleRate: 1,
    maxTargets: 2,
    timeoutMs: 3e4
  },
  evalRouting: {
    enabled: false,
    suiteIds: [],
    maxAgeHours: 720,
    minCases: 1,
    qualityWeight: 0.85,
    latencyWeight: 0.15,
    cacheTtlMs: 6e4
  },
  // Context window requirements for combo target filtering/sorting (undefined by
  // default — declared here so resolveComboSetupConfig's inferred return type
  // includes the key; combo.ts reads config.contextRequirements).
  contextRequirements: void 0
};
const LEGACY_COMBO_RESILIENCE_KEYS = /* @__PURE__ */ new Set([
  "timeoutMs",
  "healthCheckEnabled",
  "healthCheckTimeoutMs"
]);
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizePositiveTimeoutMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return Math.min(Math.floor(numericValue), MAX_TIMER_TIMEOUT_MS);
}
function resolveComboTargetTimeoutMs(config, upstreamTimeoutMs, defaultTimeoutMs = 0) {
  const ceilingTimeoutMs = normalizePositiveTimeoutMs(upstreamTimeoutMs);
  const configuredTimeoutMs = isRecord(config) ? normalizePositiveTimeoutMs(config.targetTimeoutMs) : 0;
  if (configuredTimeoutMs > 0) {
    if (ceilingTimeoutMs <= 0) return configuredTimeoutMs;
    return Math.min(configuredTimeoutMs, ceilingTimeoutMs);
  }
  const fallbackDefaultMs = normalizePositiveTimeoutMs(defaultTimeoutMs);
  if (ceilingTimeoutMs <= 0) return ceilingTimeoutMs;
  if (fallbackDefaultMs <= 0) return ceilingTimeoutMs;
  return Math.min(fallbackDefaultMs, ceilingTimeoutMs);
}
function resolveComboQueueDepth(config) {
  const raw = isRecord(config) ? Number(config.queueDepth) : Number.NaN;
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_COMBO_QUEUE_DEPTH;
  return Math.min(Math.floor(raw), MAX_COMBO_QUEUE_DEPTH);
}
function resolveComboConfig(combo, settings, provider) {
  const global = settings?.comboDefaults || {};
  const providerOverride = provider ? settings?.providerOverrides?.[provider] || {} : {};
  const comboConfig = combo?.config || {};
  const clean = (obj) => Object.fromEntries(
    Object.entries(obj).filter(
      ([key, value]) => value !== void 0 && value !== null && !LEGACY_COMBO_RESILIENCE_KEYS.has(key)
    )
  );
  const cleanGlobal = clean(global);
  const cleanProviderOverride = clean(providerOverride);
  const cleanComboConfig = clean(comboConfig);
  const merged = {
    ...DEFAULT_COMBO_CONFIG,
    ...cleanGlobal,
    ...cleanProviderOverride,
    ...cleanComboConfig
  };
  const failoverBeforeRetryExplicit = cleanComboConfig.failoverBeforeRetry === true || cleanProviderOverride.failoverBeforeRetry === true || cleanGlobal.failoverBeforeRetry === true;
  return {
    ...merged,
    failoverBeforeRetryExplicit,
    shadowRouting: {
      ...DEFAULT_COMBO_CONFIG.shadowRouting,
      ...isRecord(global.shadowRouting) ? clean(global.shadowRouting) : {},
      ...isRecord(providerOverride.shadowRouting) ? clean(providerOverride.shadowRouting) : {},
      ...isRecord(comboConfig.shadowRouting) ? clean(comboConfig.shadowRouting) : {}
    },
    evalRouting: {
      ...DEFAULT_COMBO_CONFIG.evalRouting,
      ...isRecord(global.evalRouting) ? clean(global.evalRouting) : {},
      ...isRecord(providerOverride.evalRouting) ? clean(providerOverride.evalRouting) : {},
      ...isRecord(comboConfig.evalRouting) ? clean(comboConfig.evalRouting) : {}
    }
  };
}
function getDefaultComboConfig() {
  return {
    ...DEFAULT_COMBO_CONFIG,
    // Mirror resolveComboConfig's opt-in flag so a deepEqual against the
    // default stays consistent (#10217 round-4 fix). With no cascade layer
    // setting the flag, it is a genuine non-opt-in → false.
    failoverBeforeRetryExplicit: false
  };
}
function resolveComboSetupConfig(combo, settings) {
  if (settings) return resolveComboConfig(combo, settings);
  const comboConfig = combo?.config || {};
  return {
    ...getDefaultComboConfig(),
    ...comboConfig,
    // See resolveComboConfig's failoverBeforeRetryExplicit comment — same
    // distinction applies here (no `settings`, so only the combo's own config
    // can opt in).
    failoverBeforeRetryExplicit: comboConfig.failoverBeforeRetry === true
  };
}
export {
  COMBO_TARGET_TIMEOUT_WAIT_BUFFER_MS,
  DEFAULT_COMBO_QUEUE_DEPTH,
  DEFAULT_COMBO_TARGET_TIMEOUT_MS,
  MAX_COMBO_QUEUE_DEPTH,
  PRE_SCREEN_CONCURRENCY,
  getDefaultComboConfig,
  isComboCooldownWaitEligible,
  resolveComboConfig,
  resolveComboQueueDepth,
  resolveComboSetupConfig,
  resolveComboTargetTimeoutMs,
  resolveComboTargetTimeoutMsForCombo
};
