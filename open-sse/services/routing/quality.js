const OPERATIONAL_ALPHA = 0.2;
const LATENCY_ALPHA = 0.1;
const CONFIDENCE_FULL_SAMPLES = 50;
const NEUTRAL_SCORE = 0.5;
const states = /* @__PURE__ */ new Map();
function keyOf(provider, model) {
  return `${provider}/${model}`;
}
function getOrCreate(key) {
  let state = states.get(key);
  if (!state) {
    state = {
      successEwma: 1,
      latencyEwma: 0,
      ttftEwma: null,
      samples: 0,
      anomalies: 0,
      rateLimited: 0,
      semantic: null,
      semanticConfidence: null,
      lastTs: 0
    };
    states.set(key, state);
  }
  return state;
}
function isOperationalAnomaly(event) {
  if (event.outcome === "malformed" || event.outcome === "stream_interrupted") return true;
  if (event.outcome === "success" && event.finishReason === "length") return true;
  if (event.outcome === "success" && event.outputTokens === 0) return true;
  return false;
}
function successIndicator(event) {
  if (event.outcome === "success") return 1;
  if (event.outcome === "rate_limited" || event.status === 429) return 0.5;
  return 0;
}
function recordQualityEvent(event) {
  const key = keyOf(event.provider || "unknown", event.model || "unknown");
  const state = getOrCreate(key);
  state.samples += 1;
  if (isOperationalAnomaly({
    outcome: event.outcome,
    finishReason: event.finishReason ?? null,
    outputTokens: event.outputTokens ?? void 0
  })) {
    state.anomalies += 1;
  }
  if (event.outcome === "rate_limited" || event.status === 429) state.rateLimited += 1;
  const indicator = successIndicator({ outcome: event.outcome, status: event.status });
  state.successEwma = state.samples === 1 ? indicator : state.successEwma + OPERATIONAL_ALPHA * (indicator - state.successEwma);
  const latency = Number.isFinite(event.latencyMs) && event.latencyMs >= 0 ? event.latencyMs : 0;
  state.latencyEwma = state.samples === 1 ? latency : state.latencyEwma + LATENCY_ALPHA * (latency - state.latencyEwma);
  const ttft = event.ttftMs;
  if (typeof ttft === "number" && Number.isFinite(ttft) && ttft >= 0) {
    state.ttftEwma = state.ttftEwma == null ? ttft : state.ttftEwma + LATENCY_ALPHA * (ttft - state.ttftEwma);
  }
  state.lastTs = event.ts ?? Date.now();
}
function setSemanticQuality(provider, model, score, confidence) {
  const state = getOrCreate(keyOf(provider || "unknown", model || "unknown"));
  state.semantic = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0.5));
  state.semanticConfidence = Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0));
}
function rawOperationalScore(state) {
  let score = state.successEwma;
  const latencyPenalty = Math.min(0.2, state.latencyEwma / 6e4);
  score -= latencyPenalty;
  const anomalyRate = state.anomalies / Math.max(1, state.samples);
  score -= Math.min(0.25, anomalyRate * 0.5);
  return Math.max(0, Math.min(1, score));
}
function confidenceOf(samples) {
  return Math.max(0, Math.min(1, samples / CONFIDENCE_FULL_SAMPLES));
}
function getProviderQuality(provider, model) {
  const state = states.get(keyOf(provider, model));
  const now = Date.now();
  if (!state || state.samples === 0) {
    return {
      provider,
      model,
      operational: NEUTRAL_SCORE,
      semantic: null,
      confidence: 0,
      semanticConfidence: null,
      samples: 0,
      anomalies: 0,
      rateLimited: 0,
      successEwma: 1,
      latencyEwmaMs: 0,
      ttftEwmaMs: null,
      recencyMs: null,
      lastTs: 0
    };
  }
  const confidence = confidenceOf(state.samples);
  const raw = rawOperationalScore(state);
  const operational = NEUTRAL_SCORE + confidence * (raw - NEUTRAL_SCORE);
  return {
    provider,
    model,
    operational,
    semantic: state.semantic,
    confidence,
    semanticConfidence: state.semanticConfidence,
    samples: state.samples,
    anomalies: state.anomalies,
    rateLimited: state.rateLimited,
    successEwma: state.successEwma,
    latencyEwmaMs: state.latencyEwma,
    ttftEwmaMs: state.ttftEwma,
    recencyMs: state.samples > 0 ? Math.max(0, now - state.lastTs) : null,
    lastTs: state.lastTs
  };
}
function getQualityScore(provider, model) {
  return getProviderQuality(provider, model).operational;
}
function getQualitySnapshot(limit = 200) {
  const views = [];
  for (const [key] of states) {
    const slash = key.indexOf("/");
    const provider = slash >= 0 ? key.slice(0, slash) : key;
    const model = slash >= 0 ? key.slice(slash + 1) : key;
    views.push(getProviderQuality(provider, model));
  }
  views.sort((a, b) => b.lastTs - a.lastTs);
  return views.slice(0, limit);
}
function classifyQuality(q) {
  if (q.samples === 0) return "cold";
  if (q.confidence < 0.5) return "warming";
  if (q.operational < 0.5) return "degraded";
  return "healthy";
}
function resetQualityTracker() {
  states.clear();
}
const QUALITY_WELL_KNOWN = {
  CONFIDENCE_FULL_SAMPLES,
  NEUTRAL_SCORE
};
export {
  QUALITY_WELL_KNOWN,
  classifyQuality,
  getProviderQuality,
  getQualityScore,
  getQualitySnapshot,
  recordQualityEvent,
  resetQualityTracker,
  setSemanticQuality
};
