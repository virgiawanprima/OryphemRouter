const DEFAULT_PIPELINE_BREAKER = {
  enabled: false,
  failureThreshold: 3,
  cooldownMs: 3e4
};
const _state = /* @__PURE__ */ new Map();
function get(engine) {
  let s = _state.get(engine);
  if (!s) {
    s = { failures: 0, openedUntil: null };
    _state.set(engine, s);
  }
  return s;
}
function toNonNegativeInt(raw, fallback) {
  if (raw === void 0) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
function resolvePipelineBreakerConfig(partial, env = process.env) {
  const enabled = partial?.enabled ?? env.COMPRESSION_PIPELINE_BREAKER_ENABLED === "true";
  const failureThreshold = partial?.failureThreshold ?? toNonNegativeInt(
    env.COMPRESSION_PIPELINE_BREAKER_THRESHOLD,
    DEFAULT_PIPELINE_BREAKER.failureThreshold
  );
  const cooldownMs = partial?.cooldownMs ?? toNonNegativeInt(
    env.COMPRESSION_PIPELINE_BREAKER_COOLDOWN_MS,
    DEFAULT_PIPELINE_BREAKER.cooldownMs
  );
  return {
    enabled: enabled === true,
    failureThreshold: Math.max(1, failureThreshold),
    cooldownMs: Math.max(0, cooldownMs)
  };
}
function canRunEngine(engine, config, now = Date.now()) {
  if (!config.enabled) return true;
  const s = get(engine);
  if (s.openedUntil == null) return true;
  if (now >= s.openedUntil) {
    s.openedUntil = null;
    s.failures = Math.max(0, config.failureThreshold - 1);
    return true;
  }
  return false;
}
function recordEngineFailure(engine, config, now = Date.now()) {
  if (!config.enabled) return;
  const s = get(engine);
  s.failures += 1;
  if (s.failures >= config.failureThreshold) {
    s.openedUntil = now + config.cooldownMs;
  }
}
function recordEngineSuccess(engine, config) {
  if (!config.enabled) return;
  const s = get(engine);
  s.failures = 0;
  s.openedUntil = null;
}
function getEngineBreakerState(engine) {
  const s = _state.get(engine);
  return { failures: s?.failures ?? 0, open: s?.openedUntil != null };
}
function resetPipelineEngineBreakers() {
  _state.clear();
}
export {
  DEFAULT_PIPELINE_BREAKER,
  canRunEngine,
  getEngineBreakerState,
  recordEngineFailure,
  recordEngineSuccess,
  resetPipelineEngineBreakers,
  resolvePipelineBreakerConfig
};
