// ADAPTED STUB — ported from OmniRoute src/shared/utils/runtimeTimeouts.ts
// Only `getUpstreamTimeoutConfig` is needed (by proxyDispatcher.js).
// Minimal env-driven port; returns the subset of fields proxyDispatcher reads.
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

function readTimeoutMs(env, key, fallback) {
  const raw = env && env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getUpstreamTimeoutConfig(env = process.env) {
  const sharedRequestTimeoutMs = readTimeoutMs(env, "REQUEST_TIMEOUT_MS", undefined);
  const fetchTimeoutMs = readTimeoutMs(
    env,
    "FETCH_TIMEOUT_MS",
    sharedRequestTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  );
  const streamIdleTimeoutMs = readTimeoutMs(env, "STREAM_IDLE_TIMEOUT_MS", 120_000);
  return {
    fetchTimeoutMs,
    requestTimeoutMs: sharedRequestTimeoutMs,
    streamIdleTimeoutMs,
    connectTimeoutMs: readTimeoutMs(env, "CONNECT_TIMEOUT_MS", 10_000),
  };
}
