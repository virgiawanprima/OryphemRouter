import Bottleneck from "../utils/omni/bottleneckShim.js";
import { applyBottleneckDoExpirePatch, applyBottleneckHeartbeatPatch } from "./bottleneckPatch.js";
import { parseRetryAfterFromBody } from "../utils/omni/accountFallbackExt.js";
import { getAntigravityQuotaFamily } from "./antigravityQuotaFamily.js";
import { getProviderCategory } from "../utils/omni/omniProviderRegistry.js";
import { getCodexRateLimitKey } from "../utils/omni/codexQuotaScopes.js";
import { awaitProviderDefaultSlot, setProviderQuotaOverrides } from "./providerDefaultRateLimit.js";
import {
  DEFAULT_RESILIENCE_SETTINGS,
  resolveResilienceSettings
} from "../utils/omni/resilienceSettings.js";
import {
  STANDARD_HEADERS,
  ANTHROPIC_HEADERS,
  parseResetTime,
  toPlainHeaders
} from "./rateLimitManager/headers.js";
import { checkQueueAdmission } from "./rateLimitManager/admission.js";
import {
  markLocalRateLimitError,
  RATE_LIMIT_EXECUTION_TIMEOUT_CODE,
  RATE_LIMIT_QUEUE_WEDGED_CODE
} from "./rateLimitManager/errors.js";
import { LimiterWedgeWatchdog, WATCHDOG_INTERVAL_MS } from "./rateLimitManager/wedgeWatchdog.js";
import { toNumber } from "../utils/omni/numeric.js";
import { log } from "../utils/log.js";
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function isNodeTestRunnerChild() {
  return typeof process.env.NODE_TEST_CONTEXT === "string";
}
function logRateLimit(...args) {
  if (!isNodeTestRunnerChild()) log.info("RATE-LIMIT", ...args);
}
function warnRateLimit(...args) {
  if (!isNodeTestRunnerChild()) log.warn("RATE-LIMIT", ...args);
}
function errorRateLimit(...args) {
  if (!isNodeTestRunnerChild()) log.error("RATE-LIMIT", ...args);
}
const limiters = /* @__PURE__ */ new Map();
const enabledConnections = /* @__PURE__ */ new Set();
const connectionRateLimitOverrides = /* @__PURE__ */ new Map();
const learnedLimits = {};
const MAX_LEARNED_LIMITS = 200;
const limiterLastUsed = /* @__PURE__ */ new Map();
let persistTimer = null;
const pendingAsyncOperations = /* @__PURE__ */ new Set();
const PERSIST_DEBOUNCE_MS = 6e4;
let initialized = false;
let currentRequestQueueSettings = DEFAULT_RESILIENCE_SETTINGS.requestQueue;
const ZAI_WEB_REQUEST_QUEUE_MAX_WAIT_MS = 6e4;
const limiterEffectiveSettings = /* @__PURE__ */ new WeakMap();
const preservedReplacementSettings = /* @__PURE__ */ new Map();
const limiterWatchdog = new LimiterWedgeWatchdog({
  limiters,
  limiterLastUsed,
  limiterEffectiveSettings,
  preservedReplacementSettings,
  trackBackground: (promise) => {
    trackAsyncOperation(promise);
  },
  log: logRateLimit,
  warn: warnRateLimit
});
let watchdogInterval = null;
const defaultLimiterFactory = (options) => new Bottleneck(options);
let limiterFactory = defaultLimiterFactory;
function isAutoEnableActive(settings) {
  const env = process.env.RATE_LIMIT_AUTO_ENABLE?.trim().toLowerCase();
  if (env === "false" || env === "0" || env === "off") return false;
  if (env === "true" || env === "1" || env === "on") return true;
  return settings.autoEnableApiKeyProviders;
}
const EFFECTIVELY_INFINITE = Number.MAX_SAFE_INTEGER;
const EFFECTIVELY_INFINITE_CONCURRENCY = 1e3;
function resolveOverride(override, fallback) {
  return typeof override === "number" && override > 0 ? override : fallback;
}
function resolveRpm(override) {
  return resolveOverride(override, EFFECTIVELY_INFINITE);
}
function resolveMinTime(override) {
  return resolveOverride(override, 0);
}
function resolveMaxConcurrent(override) {
  return resolveOverride(override, EFFECTIVELY_INFINITE_CONCURRENCY);
}
function resolveRequestQueueMaxWaitMs(provider, configuredMaxWaitMs = currentRequestQueueSettings.maxWaitMs, connectionId) {
  const legacyDefault = provider.trim().toLowerCase() === "zai-web" ? Math.max(configuredMaxWaitMs, ZAI_WEB_REQUEST_QUEUE_MAX_WAIT_MS) : configuredMaxWaitMs;
  const override = connectionId ? connectionRateLimitOverrides.get(connectionId)?.maxWaitMs : void 0;
  return resolveOverride(override, legacyDefault);
}
function buildLimiterDefaults() {
  return {
    maxConcurrent: resolveMaxConcurrent(currentRequestQueueSettings.concurrentRequests),
    minTime: resolveMinTime(currentRequestQueueSettings.minTimeBetweenRequestsMs),
    reservoir: resolveRpm(currentRequestQueueSettings.requestsPerMinute),
    reservoirRefreshAmount: resolveRpm(currentRequestQueueSettings.requestsPerMinute),
    reservoirRefreshInterval: 60 * 1e3
  };
}
function updateLimiterSettings(limiter, updates) {
  const effective = limiterEffectiveSettings.get(limiter) ?? {};
  limiterEffectiveSettings.set(limiter, { ...effective, ...updates });
  return limiter.updateSettings(updates);
}
function updateAllLimiterSettings() {
  const defaults = buildLimiterDefaults();
  for (const limiter of limiters.values()) {
    updateLimiterSettings(limiter, defaults);
  }
}
function clearPreservedReplacementSettings(connectionId) {
  for (const key of preservedReplacementSettings.keys()) {
    if (key.includes(connectionId)) preservedReplacementSettings.delete(key);
  }
}
function reconcileEnabledConnections(connectionsRaw, requestQueueSettings) {
  const nextEnabledConnections = /* @__PURE__ */ new Set();
  let explicitCount = 0;
  let autoCount = 0;
  for (const connRaw of connectionsRaw) {
    const conn = toRecord(connRaw);
    const connectionId = typeof conn.id === "string" ? conn.id : "";
    const provider = typeof conn.provider === "string" ? conn.provider : "";
    const isActive = conn.isActive === true;
    const rateLimitProtection = conn.rateLimitProtection === true;
    if (!connectionId || !provider) continue;
    if (rateLimitProtection) {
      nextEnabledConnections.add(connectionId);
      explicitCount++;
      continue;
    }
    if (isAutoEnableActive(requestQueueSettings) && getProviderCategory(provider) === "apikey" && isActive) {
      nextEnabledConnections.add(connectionId);
      autoCount++;
      getLimiter(provider, connectionId);
    }
  }
  for (const connectionId of Array.from(enabledConnections)) {
    if (!nextEnabledConnections.has(connectionId)) {
      disableRateLimitProtection(connectionId);
    }
  }
  for (const connectionId of nextEnabledConnections) {
    enabledConnections.add(connectionId);
  }
  return {
    explicitCount,
    autoCount
  };
}
let shutdownHandlersRegistered = false;
function startRateLimitWatchdog() {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    const run = trackAsyncOperation(limiterWatchdog.run());
    void run.then(void 0, (error) => {
      errorRateLimit("[RATE-LIMIT] Watchdog scan failed:", error);
    });
  }, WATCHDOG_INTERVAL_MS);
  watchdogInterval.unref?.();
  if (!shutdownHandlersRegistered) {
    shutdownHandlersRegistered = true;
    process.once("SIGTERM", shutdownLimiters);
    process.once("SIGINT", shutdownLimiters);
  }
}
function stopRateLimitWatchdog() {
  if (!watchdogInterval) return;
  clearInterval(watchdogInterval);
  watchdogInterval = null;
}
function shutdownLimiters() {
  for (const limiter of limiters.values()) {
    limiter.stop({ dropWaitingJobs: false });
  }
  limiters.clear();
  limiterLastUsed.clear();
  preservedReplacementSettings.clear();
}
function trackAsyncOperation(promise) {
  pendingAsyncOperations.add(promise);
  void promise.then(
    () => {
      pendingAsyncOperations.delete(promise);
    },
    () => {
      pendingAsyncOperations.delete(promise);
    }
  );
  return promise;
}
async function initializeRateLimits() {
  if (initialized) return;
  initialized = true;
  applyBottleneckDoExpirePatch();
  applyBottleneckHeartbeatPatch();
  try {
    const { getCachedProviderConnections, getSettings } = await import("@/lib/localDb");
    const [connections, settings] = await Promise.all([
      getCachedProviderConnections(),
      getSettings()
    ]);
    const resilience = resolveResilienceSettings(settings);
    currentRequestQueueSettings = { ...resilience.requestQueue };
    setProviderQuotaOverrides(resilience.providerQuotaOverrides);
    const { explicitCount, autoCount } = reconcileEnabledConnections(
      connections,
      currentRequestQueueSettings
    );
    updateAllLimiterSettings();
    connectionRateLimitOverrides.clear();
    for (const conn of connections) {
      const overrides = conn.rateLimitOverrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        connectionRateLimitOverrides.set(String(conn.id), overrides);
      }
    }
    if (explicitCount > 0 || autoCount > 0) {
      logRateLimit(
        `\u{1F6E1}\uFE0F [RATE-LIMIT] Loaded ${explicitCount} explicit + ${autoCount} auto-enabled protection(s)`
      );
    }
    await loadPersistedLimits();
    startRateLimitWatchdog();
  } catch (err) {
    errorRateLimit("[RATE-LIMIT] Failed to load settings:", err.message);
  }
}
async function applyRequestQueueSettings(nextSettings) {
  currentRequestQueueSettings = { ...nextSettings };
  preservedReplacementSettings.clear();
  const { getCachedProviderConnections } = await import("@/lib/localDb");
  const connections = await getCachedProviderConnections();
  preservedReplacementSettings.clear();
  reconcileEnabledConnections(connections, currentRequestQueueSettings);
  updateAllLimiterSettings();
}
function enableRateLimitProtection(connectionId) {
  if (!enabledConnections.has(connectionId)) clearPreservedReplacementSettings(connectionId);
  enabledConnections.add(connectionId);
}
function disableRateLimitProtection(connectionId) {
  enabledConnections.delete(connectionId);
  clearPreservedReplacementSettings(connectionId);
  for (const [key, limiter] of Array.from(limiters)) {
    if (key.includes(connectionId)) {
      limiters.delete(key);
      limiterWatchdog.forget(limiter);
      limiterLastUsed.delete(key);
      trackAsyncOperation(limiter.disconnect());
    }
  }
}
function isRateLimitEnabled(connectionId) {
  return enabledConnections.has(connectionId);
}
function refreshConnectionRateLimits(connectionId, overrides) {
  if (overrides === null || overrides === void 0) {
    connectionRateLimitOverrides.delete(connectionId);
  } else {
    connectionRateLimitOverrides.set(connectionId, overrides);
  }
  clearPreservedReplacementSettings(connectionId);
  for (const [key, limiter] of Array.from(limiters)) {
    if (key.includes(connectionId)) {
      limiters.delete(key);
      limiterWatchdog.forget(limiter);
      limiterLastUsed.delete(key);
      trackAsyncOperation(limiter.disconnect());
    }
  }
}
function getLimiterKey(provider, connectionId, model = null) {
  if (provider === "codex" && model) {
    return `${provider}:${getCodexRateLimitKey(connectionId, model)}`;
  }
  if ((provider === "antigravity" || provider === "agy") && model) {
    const family = getAntigravityQuotaFamily(model);
    const scope = family === "other" ? model : family;
    return `${provider}:${connectionId}:${scope}`;
  }
  if ((provider === "gemini" || provider === "github") && model) {
    return `${provider}:${connectionId}:${model}`;
  }
  return `${provider}:${connectionId}`;
}
function getLimiter(provider, connectionId, model = null) {
  const key = getLimiterKey(provider, connectionId, model);
  if (!limiters.has(key)) {
    applyBottleneckDoExpirePatch();
    applyBottleneckHeartbeatPatch();
    const preserved = preservedReplacementSettings.get(key);
    let options;
    if (preserved) {
      preservedReplacementSettings.delete(key);
      options = { ...preserved, id: key };
    } else {
      const defaults = buildLimiterDefaults();
      const overrides = connectionRateLimitOverrides.get(connectionId);
      if (overrides) {
        if (typeof overrides.maxConcurrent === "number" && overrides.maxConcurrent > 0) {
          defaults.maxConcurrent = overrides.maxConcurrent;
        }
        if (typeof overrides.minTime === "number" && overrides.minTime > 0) {
          defaults.minTime = overrides.minTime;
        }
        if (typeof overrides.rpm === "number" && overrides.rpm > 0) {
          defaults.reservoir = overrides.rpm;
          defaults.reservoirRefreshAmount = overrides.rpm;
          defaults.reservoirRefreshInterval = 60 * 1e3;
        }
      }
      options = { ...defaults, id: key };
    }
    const limiter = limiterFactory(options);
    limiterEffectiveSettings.set(limiter, { ...options });
    limiter.on("queued", () => {
      limiterWatchdog.noteQueued(key, limiter);
    });
    const markQueueProgress = () => {
      limiterWatchdog.noteProgress(key, limiter);
    };
    limiter.on("executing", markQueueProgress);
    limiter.on("done", markQueueProgress);
    limiters.set(key, limiter);
    limiterLastUsed.set(key, Date.now());
  }
  limiterLastUsed.set(key, Date.now());
  return limiters.get(key);
}
async function withRateLimit(provider, connectionId, model, fn, signal = null) {
  if (!enabledConnections.has(connectionId)) {
    return fn();
  }
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) throw reason;
    const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
    err.name = "AbortError";
    throw err;
  }
  const maxWaitMs = resolveRequestQueueMaxWaitMs(provider, void 0, connectionId);
  await awaitProviderDefaultSlot(provider, connectionId, signal, maxWaitMs);
  const limiter = getLimiter(provider, connectionId, model);
  const executionExpirationMs = maxWaitMs;
  const scheduleOpts = executionExpirationMs && executionExpirationMs > 0 ? { expiration: executionExpirationMs } : {};
  const admissionErr = checkQueueAdmission(
    limiter.counts().QUEUED,
    currentRequestQueueSettings.maxQueueDepth,
    model ? `${provider}/${model}` : provider
  );
  if (admissionErr) {
    logRateLimit(
      `\u{1F6A7} [RATE-LIMIT] ${getLimiterKey(provider, connectionId, model)} \u2014 queue full, rejecting fast (maxQueueDepth=${currentRequestQueueSettings.maxQueueDepth})`
    );
    throw admissionErr;
  }
  try {
    if (signal) {
      let abortListener;
      const { promise: abortPromise, reject: rejectAbort } = Promise.withResolvers();
      const onAbort = () => {
        const reason = signal.reason;
        if (reason instanceof Error) {
          rejectAbort(reason);
          return;
        }
        const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
        err.name = "AbortError";
        if (reason !== void 0) {
          err.cause = reason;
        }
        rejectAbort(err);
      };
      if (signal.aborted) {
        onAbort();
      } else {
        abortListener = onAbort;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      try {
        const scheduled = limiter.schedule(scheduleOpts, fn);
        scheduled.catch(() => {
        });
        abortPromise.catch(() => {
        });
        return await Promise.race([scheduled, abortPromise]);
      } finally {
        if (abortListener) {
          signal.removeEventListener("abort", abortListener);
        }
      }
    } else {
      return await limiter.schedule(scheduleOpts, fn);
    }
  } catch (err) {
    if (err instanceof Bottleneck.BottleneckError && /^This job timed out after \d+ ms\.$/.test(err.message)) {
      const key = getLimiterKey(provider, connectionId, model);
      logRateLimit(
        `\u23F0 [RATE-LIMIT] ${key} \u2014 limiter-managed execution expired after ${Math.ceil((executionExpirationMs || 0) / 1e3)}s`
      );
      throw markLocalRateLimitError(
        new Error(
          `Request exceeded OmniRoute's local rate-limit execution expiration (legacy resilienceSettings.requestQueue.maxWaitMs=${executionExpirationMs}ms) for ${model ? `${provider}/${model}` : provider}. Bottleneck applies this deadline only after dispatch; it does not bound queue wait and is not an upstream-generated timeout.`,
          { cause: err }
        ),
        RATE_LIMIT_EXECUTION_TIMEOUT_CODE
      );
    }
    if (err instanceof Bottleneck.BottleneckError && err.message === "rate-limit-watchdog-wedge-reset") {
      const cleanup = limiterWatchdog.getEviction(limiter);
      if (!cleanup) throw err;
      let cleanupError;
      try {
        await cleanup;
      } catch (error) {
        cleanupError = error;
        errorRateLimit("[RATE-LIMIT] Wedge cleanup failed:", error);
      }
      const key = getLimiterKey(provider, connectionId, model);
      logRateLimit(`\u21AA\uFE0F [RATE-LIMIT] ${key} \u2014 surfacing local wedge; caller will not be replayed`);
      const wedgeErr = new Error(
        `Request dropped: the local rate-limit queue for ${model ? `${provider}/${model}` : provider} was detected as wedged (stalled with nothing executing) and force-reset. OmniRoute does not replay dropped work automatically; combo routing may fall back to another target.`,
        { cause: err }
      );
      if (cleanupError !== void 0) wedgeErr.cleanupError = cleanupError;
      throw markLocalRateLimitError(wedgeErr, RATE_LIMIT_QUEUE_WEDGED_CODE);
    }
    throw err;
  }
}
function updateFromHeaders(provider, connectionId, headers, status, model = null) {
  if (!enabledConnections.has(connectionId)) return;
  if (!headers) return;
  const plainHeaders = toPlainHeaders(headers);
  const limiter = getLimiter(provider, connectionId, model);
  const headerMap = provider === "claude" || provider === "anthropic" ? ANTHROPIC_HEADERS : STANDARD_HEADERS;
  const getHeader = (name) => {
    return plainHeaders[name.toLowerCase()] || null;
  };
  const limit = parseInt(getHeader(headerMap.limit));
  const remaining = parseInt(getHeader(headerMap.remaining));
  const resetStr = getHeader(headerMap.reset);
  const retryAfterStr = getHeader(headerMap.retryAfter);
  const overLimit = getHeader(STANDARD_HEADERS.overLimit);
  if (status === 429) {
    const retryAfterMs = parseResetTime(retryAfterStr) || 6e4;
    const counts = limiter.counts();
    const limiterKey = getLimiterKey(provider, connectionId, model);
    logRateLimit(
      `\u{1F6AB} [RATE-LIMIT] ${provider}:${connectionId.slice(0, 8)} \u2014 429 received, pausing for ${Math.ceil(retryAfterMs / 1e3)}s, dropping ${counts.QUEUED} queued request(s)`
    );
    limiters.delete(limiterKey);
    limiterWatchdog.forget(limiter);
    limiterLastUsed.delete(limiterKey);
    preservedReplacementSettings.delete(limiterKey);
    trackAsyncOperation(limiter.disconnect());
    return;
  }
  if (overLimit === "yes") {
    logRateLimit(
      `\u26A0\uFE0F [RATE-LIMIT] ${provider}:${connectionId.slice(0, 8)} \u2014 near capacity, slowing down`
    );
    updateLimiterSettings(limiter, {
      minTime: 200
      // Add 200ms between requests
    });
    return;
  }
  if (!isNaN(limit) && limit > 0) {
    const resetMs = parseResetTime(resetStr) || 6e4;
    const minTime = Math.max(0, Math.floor(6e4 / limit) - 10);
    const updates = { minTime };
    if (!isNaN(remaining)) {
      if (remaining < limit * 0.1) {
        updates.reservoir = remaining;
        updates.reservoirRefreshAmount = limit;
        updates.reservoirRefreshInterval = resetMs;
        logRateLimit(
          `\u26A0\uFE0F [RATE-LIMIT] ${provider}:${connectionId.slice(0, 8)} \u2014 ${remaining}/${limit} remaining, throttling`
        );
      } else if (remaining > limit * 0.5) {
        updates.minTime = resolveMinTime(currentRequestQueueSettings.minTimeBetweenRequestsMs);
        updates.reservoir = null;
        updates.reservoirRefreshAmount = null;
        updates.reservoirRefreshInterval = null;
      }
    }
    updateLimiterSettings(limiter, updates);
    recordLearnedLimit(
      provider,
      connectionId,
      { limit, remaining, minTime: updates.minTime },
      model
    );
  }
}
function getRateLimitStatus(provider, connectionId) {
  const key = `${provider}:${connectionId}`;
  const limiter = limiters.get(key);
  if (!limiter) {
    return {
      enabled: enabledConnections.has(connectionId),
      active: false,
      queued: 0,
      running: 0
    };
  }
  const counts = limiter.counts();
  return {
    enabled: enabledConnections.has(connectionId),
    active: true,
    queued: counts.QUEUED || 0,
    running: counts.RUNNING || 0,
    executing: counts.EXECUTING || 0,
    done: counts.DONE || 0
  };
}
function getAllRateLimitStatus() {
  const result = {};
  for (const [key, limiter] of limiters) {
    const counts = limiter.counts();
    result[key] = {
      queued: counts.QUEUED || 0,
      running: counts.RUNNING || 0,
      executing: counts.EXECUTING || 0
    };
  }
  return result;
}
function getLearnedLimits() {
  return { ...learnedLimits };
}
async function persistLearnedLimitsNow() {
  try {
    const { updateSettings } = await import("@/lib/db/settings");
    await updateSettings({ learnedRateLimits: JSON.stringify(learnedLimits) });
    logRateLimit(
      `\u{1F4BE} [RATE-LIMIT] Persisted learned limits for ${Object.keys(learnedLimits).length} provider(s)`
    );
  } catch (err) {
    errorRateLimit("[RATE-LIMIT] Failed to persist learned limits:", err.message);
  }
}
function recordLearnedLimit(provider, connectionId, limits, model = null) {
  const key = getLimiterKey(provider, connectionId, model);
  learnedLimits[key] = {
    ...limits,
    provider,
    connectionId,
    lastUpdated: Date.now()
  };
  if (!persistTimer) {
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      await trackAsyncOperation(persistLearnedLimitsNow());
    }, PERSIST_DEBOUNCE_MS);
  }
}
async function __flushLearnedLimitsForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await trackAsyncOperation(persistLearnedLimitsNow());
  if (pendingAsyncOperations.size > 0) {
    await Promise.allSettled(Array.from(pendingAsyncOperations));
  }
}
function __setLimiterFactoryForTests(factory) {
  limiterFactory = factory;
}
async function __runLimiterWatchdogForTests(now = Date.now()) {
  await limiterWatchdog.run(now);
}
async function __resetRateLimitManagerForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const disconnectPromises = [];
  for (const limiter of limiters.values()) {
    disconnectPromises.push(limiter.disconnect());
  }
  limiters.clear();
  enabledConnections.clear();
  initialized = false;
  limiterLastUsed.clear();
  preservedReplacementSettings.clear();
  limiterFactory = defaultLimiterFactory;
  limiterWatchdog.reset();
  shutdownHandlersRegistered = false;
  for (const key of Object.keys(learnedLimits)) {
    delete learnedLimits[key];
  }
  if (pendingAsyncOperations.size > 0) {
    await Promise.allSettled(Array.from(pendingAsyncOperations));
  }
  if (disconnectPromises.length > 0) {
    await Promise.allSettled(disconnectPromises);
  }
}
async function __getLimiterStateForTests(provider, connectionId, model = null) {
  const key = getLimiterKey(provider, connectionId, model);
  const limiter = limiters.get(key);
  if (!limiter) return null;
  const counts = limiter.counts();
  const reservoir = await limiter.currentReservoir();
  return {
    key,
    reservoir,
    queued: counts.QUEUED || 0,
    running: counts.RUNNING || 0,
    executing: counts.EXECUTING || 0,
    done: counts.DONE || 0
  };
}
async function loadPersistedLimits() {
  try {
    const { getSettings } = await import("@/lib/db/settings");
    const settings = await getSettings();
    const raw = settings?.learnedRateLimits;
    if (typeof raw !== "string" || raw.trim().length === 0) return;
    const parsed = toRecord(JSON.parse(raw));
    let count = 0;
    for (const [key, dataRaw] of Object.entries(parsed)) {
      const data = toRecord(dataRaw);
      const lastUpdated = toNumber(data.lastUpdated, 0);
      if (lastUpdated > 0 && Date.now() - lastUpdated > 24 * 60 * 60 * 1e3) continue;
      const connectionId = typeof data.connectionId === "string" ? data.connectionId : "";
      const provider = typeof data.provider === "string" ? data.provider : "";
      const limit = toNumber(data.limit, 0);
      const remaining = toNumber(data.remaining, 0);
      const minTime = toNumber(data.minTime, 0);
      learnedLimits[key] = {
        provider,
        connectionId,
        lastUpdated,
        ...limit > 0 ? { limit } : {},
        ...remaining >= 0 ? { remaining } : {},
        ...minTime >= 0 ? { minTime } : {}
      };
      if (connectionId && enabledConnections.has(connectionId)) {
        const limiter = limiters.get(key);
        if (limiter && limit > 0) {
          const inferredMinTime = minTime || Math.max(0, Math.floor(6e4 / limit) - 10);
          updateLimiterSettings(limiter, { minTime: inferredMinTime });
          count++;
        }
      }
    }
    if (count > 0) {
      logRateLimit(`\u{1F4E5} [RATE-LIMIT] Restored ${count} learned rate limit(s) from persistence`);
    }
  } catch (err) {
    errorRateLimit("[RATE-LIMIT] Failed to load persisted limits:", err.message);
  }
}
function updateFromResponseBody(provider, connectionId, responseBody, status, model = null) {
  if (!enabledConnections.has(connectionId)) return;
  const { retryAfterMs, reason } = parseRetryAfterFromBody(responseBody);
  if (retryAfterMs && retryAfterMs > 0) {
    const limiter = getLimiter(provider, connectionId, model);
    logRateLimit(
      `\u{1F6AB} [RATE-LIMIT] ${provider}:${connectionId.slice(0, 8)} \u2014 body-parsed retry: ${Math.ceil(retryAfterMs / 1e3)}s (${reason})`
    );
    updateLimiterSettings(limiter, {
      reservoir: 0,
      reservoirRefreshAmount: 60,
      reservoirRefreshInterval: retryAfterMs
    });
  }
}
export {
  ZAI_WEB_REQUEST_QUEUE_MAX_WAIT_MS,
  __flushLearnedLimitsForTests,
  __getLimiterStateForTests,
  __resetRateLimitManagerForTests,
  __runLimiterWatchdogForTests,
  __setLimiterFactoryForTests,
  applyRequestQueueSettings,
  disableRateLimitProtection,
  enableRateLimitProtection,
  getAllRateLimitStatus,
  getLearnedLimits,
  getRateLimitStatus,
  initializeRateLimits,
  isRateLimitEnabled,
  refreshConnectionRateLimits,
  resolveRequestQueueMaxWaitMs,
  startRateLimitWatchdog,
  stopRateLimitWatchdog,
  updateFromHeaders,
  updateFromResponseBody,
  withRateLimit
};
