import {
  clearRoutingEventSinks,
  dispatchRoutingEvent,
  listRoutingEventSinks,
  MemoryRoutingEventStore,
  registerRoutingEventSink
} from "./events.js";
import {
  getProviderQuality,
  getQualityScore,
  getQualitySnapshot,
  recordQualityEvent,
  resetQualityTracker
} from "./quality.js";
import { isRoutingOtelEnabled, OtlpHttpsEventSink } from "./otel.js";
const memoryStore = new MemoryRoutingEventStore(500);
const qualitySink = {
  name: "quality",
  record(event) {
    recordQualityEvent(event);
  }
};
let otelSink = null;
let initialized = false;
function initRoutingObservability(env = process.env) {
  if (initialized) {
    return { sinks: listRoutingSinkNames(), otelEnabled: isRoutingOtelEnabled(env) };
  }
  initialized = true;
  registerRoutingEventSink(memoryStore);
  registerRoutingEventSink(qualitySink);
  if (isRoutingOtelEnabled(env)) {
    const endpoint = (env.OMNIROUTE_OTEL_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").trim();
    otelSink = new OtlpHttpsEventSink({
      endpoint,
      serviceName: env.OTEL_SERVICE_NAME ?? "omniroute",
      maxBatchSize: 64,
      flushIntervalMs: 1e4
    });
    registerRoutingEventSink(otelSink);
  }
  return { sinks: listRoutingSinkNames(), otelEnabled: otelSink != null };
}
function emitRoutingEvent(event) {
  if (!initialized) initRoutingObservability();
  dispatchRoutingEvent(event);
}
function qualityScoreFor(provider, model) {
  return getQualityScore(provider, model);
}
function providerQualityFor(provider, model) {
  return getProviderQuality(provider, model);
}
import { setSemanticQuality as setSemanticQuality2 } from "./quality.js";
function routingQualitySnapshot(limit = 200) {
  return getQualitySnapshot(limit);
}
import { classifyQuality } from "./quality.js";
function recentRoutingEvents(limit = 50) {
  return memoryStore.recent(limit);
}
function routingOtelStats() {
  return otelSink ? otelSink.getStats() : null;
}
function listRoutingSinkNames() {
  return listRoutingEventSinks();
}
function resetRoutingObservability() {
  clearRoutingEventSinks();
  memoryStore.clear();
  resetQualityTracker();
  if (otelSink) {
    otelSink.stop();
    otelSink = null;
  }
  initialized = false;
}
import { createRoutingEvent, outcomeFromStatus } from "./events.js";
export {
  classifyQuality,
  createRoutingEvent,
  emitRoutingEvent,
  initRoutingObservability,
  outcomeFromStatus,
  providerQualityFor,
  qualityScoreFor,
  recentRoutingEvents,
  resetRoutingObservability,
  routingOtelStats,
  routingQualitySnapshot,
  setSemanticQuality2 as setSemanticQuality
};
