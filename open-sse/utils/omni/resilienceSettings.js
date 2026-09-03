// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/resilience/settings.ts` (~17KB) computes runtime resilience settings
// (queue wedging timeouts, circuit-breaker thresholds, stream-recovery flags) from env vars
// + the operator config. This minimal version exposes the defaults consumed by
// `rateLimitManager` (`DEFAULT_RESILIENCE_SETTINGS`, `resolveResilienceSettings`) with
// graceful env-driven overrides.

export const DEFAULT_RESILIENCE_SETTINGS = {
  queue: {
    maxConcurrent: 6,
    highWater: 500,
    wedgeTimeoutMs: 30_000,
    enableWedgeWatchdog: true,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetWindowMs: 60_000,
  },
  streamRecovery: {
    enabled: false,
    holdbackMs: 750,
    bufferMaxBytes: 65536,
    earlyRetryMax: 4,
  },
};

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve the effective settings, overlaying env-var overrides on the defaults.
 * OmniRoute's original also merges operator-supplied settings — this adaptation keeps
 * that contract by accepting an optional overrides argument.
 */
export function resolveResilienceSettings(overrides) {
  const resolved = {
    queue: {
      ...DEFAULT_RESILIENCE_SETTINGS.queue,
      ...(overrides?.queue ?? {}),
      maxConcurrent: envInt("OMNIROUTE_QUEUE_MAX_CONCURRENT", DEFAULT_RESILIENCE_SETTINGS.queue.maxConcurrent),
      highWater: envInt("OMNIROUTE_QUEUE_HIGH_WATER", DEFAULT_RESILIENCE_SETTINGS.queue.highWater),
      wedgeTimeoutMs: envInt("OMNIROUTE_QUEUE_WEDGE_TIMEOUT_MS", DEFAULT_RESILIENCE_SETTINGS.queue.wedgeTimeoutMs),
    },
    circuitBreaker: {
      ...DEFAULT_RESILIENCE_SETTINGS.circuitBreaker,
      ...(overrides?.circuitBreaker ?? {}),
    },
    streamRecovery: {
      ...DEFAULT_RESILIENCE_SETTINGS.streamRecovery,
      ...(overrides?.streamRecovery ?? {}),
      enabled:
        overrides?.streamRecovery?.enabled ??
        (process.env.STREAM_RECOVERY_ENABLED === "1" ||
          process.env.STREAM_RECOVERY_ENABLED === "true"),
    },
  };
  return resolved;
}
