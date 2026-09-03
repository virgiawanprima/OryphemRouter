// Ported from OmniRoute open-sse/config/constants.ts (STREAM_RECOVERY + STREAM_THROUGHPUT_WATCHDOG
// only). The full constants module drags in deep app infra; this is the isolated subset
// consumed by `streamRecovery` / `throughputWatchdog`.

export const STREAM_RECOVERY = {
  HOLDBACK_MS: 750,
  BUFFER_MAX_BYTES: 65536,
  EARLY_RETRY_MAX: 4,
  MIN_CONTINUATION_OVERLAP_CHARS: 8,
};

export const STREAM_THROUGHPUT_WATCHDOG = {
  WARMUP_MS: 30_000,
  WINDOW_MS: 30_000,
  MIN_USEFUL_BYTES_PER_SECOND: 4,
  MIN_USEFUL_BYTES: 1,
};
