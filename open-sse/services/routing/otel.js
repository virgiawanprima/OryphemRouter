function isRoutingOtelEnabled(env = process.env) {
  const endpoint = (env.OMNIROUTE_OTEL_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").trim();
  return endpoint.length > 0;
}
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomId(bytes) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return toHex(arr);
}
class OtlpHttpsEventSink {
  constructor(config) {
    this.config = config;
    this.endpoint = config.endpoint.replace(/\/+$/, "") + "/v1/traces";
    this.maxBatchSize = config.maxBatchSize ?? 64;
    this.serviceName = config.serviceName ?? "omniroute";
    this.start();
  }
  name = "otel";
  endpoint;
  maxBatchSize;
  serviceName;
  buffer = [];
  dropped = 0;
  consecutiveFailures = 0;
  flushedBatches = 0;
  timer = null;
  flushing = false;
  /** O(1) enqueue; drops oldest when the buffer is full. Never performs I/O. */
  record(event) {
    if (this.buffer.length >= this.maxBatchSize * 4) {
      this.buffer.shift();
      this.dropped += 1;
    }
    this.buffer.push(event);
  }
  getStats() {
    return {
      buffered: this.buffer.length,
      dropped: this.dropped,
      consecutiveFailures: this.consecutiveFailures,
      flushedBatches: this.flushedBatches
    };
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.flush();
  }
  start() {
    const intervalMs = this.config.flushIntervalMs ?? 1e4;
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref?.();
  }
  async flush() {
    if (this.flushing) return;
    if (this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.maxBatchSize);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOtlpTracesPayload(batch, this.serviceName)),
        signal: AbortSignal.timeout(3e3)
      });
      if (!res.ok) throw new Error(`OTLP collector returned ${res.status}`);
      this.consecutiveFailures = 0;
      this.flushedBatches += 1;
    } catch {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.dropped += batch.length;
      } else {
        this.buffer.unshift(...batch);
      }
    } finally {
      this.flushing = false;
    }
  }
}
const MAX_CONSECUTIVE_FAILURES = 5;
function buildOtlpTracesPayload(events, serviceName) {
  const resourceSpans = [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: serviceName } },
          { key: "telemetry.sdk.name", value: { stringValue: "omniroute-routing" } }
        ]
      },
      scopeSpans: [
        {
          scope: { name: "omniroute.routing" },
          spans: events.map(toSpan)
        }
      ]
    }
  ];
  return { resourceSpans };
}
function attr(key, value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? { key, value: { intValue: String(value) } } : { key, value: { doubleValue: value } };
  }
  return { key, value: { stringValue: String(value) } };
}
function toSpan(event) {
  const traceId = randomId(16);
  const spanId = randomId(8);
  const startNs = BigInt(event.ts) * 1000000n;
  const endNs = startNs + BigInt(Math.max(0, event.latencyMs || 0)) * 1000000n;
  const attributes = [
    attr("gen_ai.provider.name", event.provider),
    attr("gen_ai.request.model", event.model),
    attr("gen_ai.operation.name", "chat"),
    attr("gen_ai.system", event.strategy || "direct"),
    attr("gen_ai.usage.input_tokens", event.inputTokens ?? 0),
    attr("gen_ai.usage.output_tokens", event.outputTokens ?? 0),
    attr("gen_ai.completion.finish_reason", event.finishReason ?? "unknown"),
    attr("gen_ai.request.temperature", 0),
    attr("omniroute.routing.outcome", event.outcome),
    attr("omniroute.routing.status", event.status ?? 0),
    attr("omniroute.routing.ttft_ms", event.ttftMs ?? -1),
    attr("omniroute.routing.itl_ms", event.itlMs ?? -1),
    attr("omniroute.routing.retries", event.retries ?? 0),
    attr("omniroute.routing.fallback_used", event.fallbackUsed ? 1 : 0),
    attr("gen_ai.client.token.usage.input_tokens", event.inputTokens ?? 0),
    attr("gen_ai.client.token.usage.output_tokens", event.outputTokens ?? 0)
  ];
  if (event.connectionId) attributes.push(attr("omniroute.connection_id", event.connectionId));
  return {
    traceId,
    spanId,
    name: `chat ${event.provider}/${event.model}`,
    kind: 3,
    // CLIENT
    startTimeUnixNano: startNs.toString(),
    endTimeUnixNano: endNs.toString(),
    attributes
  };
}
export {
  OtlpHttpsEventSink,
  buildOtlpTracesPayload,
  isRoutingOtelEnabled
};
