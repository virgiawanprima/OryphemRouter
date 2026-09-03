const ROUTING_OUTCOMES = [
  "success",
  "error",
  "malformed",
  "timeout",
  "rate_limited",
  "stream_interrupted",
  "guardrail_blocked",
  "cancelled"
];
const sinks = /* @__PURE__ */ new Set();
function registerRoutingEventSink(sink) {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}
function listRoutingEventSinks() {
  return Array.from(sinks, (s) => s.name);
}
function clearRoutingEventSinks() {
  sinks.clear();
}
function dispatchRoutingEvent(event) {
  for (const sink of sinks) {
    try {
      sink.record(event);
    } catch {
    }
  }
}
class MemoryRoutingEventStore {
  constructor(capacity = 500) {
    this.capacity = capacity;
  }
  name = "memory";
  buffer = [];
  cursor = 0;
  record(event) {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(event);
    } else {
      this.buffer[this.cursor] = event;
    }
    this.cursor = (this.cursor + 1) % this.capacity;
  }
  /** Most recent events, newest first, up to `limit`. */
  recent(limit = 50) {
    if (this.buffer.length < this.capacity) {
      return this.buffer.slice(-limit).reverse();
    }
    const out = [];
    for (let i = 0; i < Math.min(limit, this.buffer.length); i++) {
      const idx = (this.cursor - 1 - i + this.buffer.length) % this.buffer.length;
      out.push(this.buffer[idx]);
    }
    return out;
  }
  clear() {
    this.buffer = [];
    this.cursor = 0;
  }
  get size() {
    return this.buffer.length;
  }
}
function createRoutingEvent(input) {
  return {
    requestId: input.requestId,
    provider: input.provider || "unknown",
    model: input.model || "unknown",
    strategy: input.strategy ?? "direct",
    latencyMs: Math.max(0, input.latencyMs || 0),
    ttftMs: input.ttftMs ?? null,
    itlMs: input.itlMs ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    cost: input.cost ?? null,
    retries: input.retries ?? 0,
    fallbackUsed: input.fallbackUsed ?? false,
    outcome: input.outcome,
    status: input.status ?? null,
    finishReason: input.finishReason ?? null,
    connectionId: input.connectionId ?? null,
    ts: input.ts ?? Date.now()
  };
}
function outcomeFromStatus(status) {
  if (status == null) return "error";
  if (status === 200 || status === 201) return "success";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "error";
}
export {
  MemoryRoutingEventStore,
  ROUTING_OUTCOMES,
  clearRoutingEventSinks,
  createRoutingEvent,
  dispatchRoutingEvent,
  listRoutingEventSinks,
  outcomeFromStatus,
  registerRoutingEventSink
};
