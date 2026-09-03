function clampLimit(value, minLimit, maxLimit) {
  if (!Number.isFinite(value)) return minLimit;
  return Math.min(maxLimit, Math.max(minLimit, Math.floor(value)));
}
function createAdaptationState(initialLimit, minLimit, maxLimit, nowMs) {
  return {
    currentLimit: clampLimit(initialLimit, minLimit, maxLimit),
    recoveryCeiling: clampLimit(initialLimit, minLimit, maxLimit),
    shortLatencyEwma: 0,
    longLatencyEwma: 0,
    pressure: "normal",
    windowActiveCostIntegral: 0,
    windowCompleted: 0,
    windowLatencySamples: 0,
    windowStartMs: nowMs,
    freezeGrowth: false,
    criticalDecreaseConsumed: false,
    utilization: 0
  };
}
function noteLatency(state, latencyMs, params) {
  const sample = Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
  state.windowLatencySamples += 1;
  const sa = params.shortLatencyAlpha;
  const la = params.longLatencyAlpha;
  if (state.shortLatencyEwma <= 0 && state.longLatencyEwma <= 0) {
    state.shortLatencyEwma = sample;
    state.longLatencyEwma = sample;
    return;
  }
  state.shortLatencyEwma = sa * sample + (1 - sa) * state.shortLatencyEwma;
  state.longLatencyEwma = la * sample + (1 - la) * state.longLatencyEwma;
}
function noteOutcome(state, outcome) {
  if (outcome === "upstream_error") {
    state.freezeGrowth = true;
    return;
  }
  if (outcome === "timeout") {
    state.freezeGrowth = true;
  }
}
function setPressure(state, pressure) {
  const severity = { normal: 0, high: 1, critical: 2 };
  if (severity[pressure] > severity[state.pressure]) state.pressure = pressure;
}
function closeAdaptationWindow(state, params, nowMs) {
  const elapsed = Math.max(1, Math.min(params.windowMs, nowMs - state.windowStartMs));
  const avgActive = state.windowActiveCostIntegral / elapsed;
  const util = state.currentLimit > 0 ? avgActive / state.currentLimit : 0;
  state.utilization = Math.max(0, Math.min(1, util));
  let next = state.currentLimit;
  const gradient = state.longLatencyEwma > 0 ? (state.shortLatencyEwma - state.longLatencyEwma) / state.longLatencyEwma : 0;
  if (state.pressure === "critical") {
    if (!state.criticalDecreaseConsumed) {
      next = Math.floor(next * params.criticalDecreaseFactor);
    }
  } else if (state.pressure === "high" || state.windowLatencySamples > 0 && gradient >= params.latencyGradientThreshold) {
    next = Math.floor(next * params.decreaseFactor);
  } else if (!state.freezeGrowth && state.pressure === "normal" && state.utilization >= params.highUtilizationThreshold && state.windowCompleted > 0) {
    const step = Math.min(params.increaseStep, params.maxIncreasePerWindow);
    next = next + step;
  }
  if (state.utilization <= params.lowUtilizationThreshold) {
    state.shortLatencyEwma = state.longLatencyEwma;
    next = applyIdleRecovery(state, params, next);
  }
  state.currentLimit = clampLimit(next, params.minLimit, params.maxLimit);
  state.windowActiveCostIntegral = 0;
  state.windowCompleted = 0;
  state.windowLatencySamples = 0;
  state.windowStartMs = nowMs;
  state.freezeGrowth = false;
  state.criticalDecreaseConsumed = false;
  state.pressure = "normal";
}
function applyIdleRecovery(state, params, next) {
  if (state.pressure !== "critical" && !state.freezeGrowth && state.windowCompleted === 0 && state.currentLimit < state.recoveryCeiling) {
    const step = Math.min(params.increaseStep, params.maxIncreasePerWindow);
    return Math.min(state.recoveryCeiling, next + step);
  }
  return next;
}
function sampleActiveIntegral(state, activeCost, dtMs) {
  if (dtMs <= 0 || activeCost <= 0) return;
  const boundedActiveCost = Math.min(activeCost, state.currentLimit);
  const contribution = dtMs > Math.floor(Number.MAX_SAFE_INTEGER / boundedActiveCost) ? Number.MAX_SAFE_INTEGER : boundedActiveCost * dtMs;
  state.windowActiveCostIntegral = contribution >= Number.MAX_SAFE_INTEGER - state.windowActiveCostIntegral ? Number.MAX_SAFE_INTEGER : state.windowActiveCostIntegral + contribution;
}
export {
  clampLimit,
  closeAdaptationWindow,
  createAdaptationState,
  noteLatency,
  noteOutcome,
  sampleActiveIntegral,
  setPressure
};
