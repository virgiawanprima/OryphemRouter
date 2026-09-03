class ThroughputWatchdogError extends Error {
  code = "STREAM_THROUGHPUT_TOO_LOW";
  constructor(message = "Upstream stream throughput remained below the configured minimum") {
    super(message);
    this.name = "ThroughputWatchdogError";
  }
}
function parseEvent(event) {
  const lines = event.split(/\r?\n/);
  const eventName = lines.find((line) => /^event:\s*/i.test(line))?.replace(/^event:\s*/i, "").trim();
  const data = lines.filter((line) => /^data:\s*/i.test(line)).map((line) => line.replace(/^data:\s*/i, "").trim()).join("\n");
  if (!data || data === "[DONE]") return { usefulBytes: 0, protectedPhase: false };
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return { usefulBytes: 0, protectedPhase: false };
  }
  const record = payload;
  const type = typeof record.type === "string" ? record.type : eventName;
  if (type && /(reasoning|thinking|tool|function_call)/i.test(type)) {
    return { usefulBytes: 0, protectedPhase: true };
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  let useful = "";
  let protectedPhase = false;
  for (const choice of choices) {
    const delta = choice.delta;
    if (!delta || typeof delta !== "object") continue;
    const deltaRecord = delta;
    if (Array.isArray(deltaRecord.tool_calls) || deltaRecord.function_call) {
      protectedPhase = true;
    }
    for (const key of ["content", "text"]) {
      if (typeof deltaRecord[key] === "string") useful += deltaRecord[key];
    }
    if (typeof deltaRecord.reasoning_content === "string" || typeof deltaRecord.reasoning === "string") {
      protectedPhase = true;
    }
  }
  const outputText = typeof record.delta === "string" ? record.delta : void 0;
  if (outputText) useful += outputText;
  const nestedDelta = record.delta;
  if (nestedDelta && typeof nestedDelta === "object") {
    const nested = nestedDelta;
    const nestedType = typeof nested.type === "string" ? nested.type : "";
    if (/(reasoning|thinking|tool|function_call)/i.test(nestedType)) {
      protectedPhase = true;
    }
    if (typeof nested.text === "string") useful += nested.text;
  }
  const contentBlock = record.content_block;
  if (contentBlock && typeof contentBlock === "object") {
    const blockType = contentBlock.type;
    if (typeof blockType === "string" && /(reasoning|thinking|tool_use)/i.test(blockType)) {
      protectedPhase = true;
    }
  }
  if (protectedPhase) useful = "";
  return {
    usefulBytes: useful ? new TextEncoder().encode(useful).byteLength : 0,
    protectedPhase
  };
}
class ThroughputWatchdog {
  enabled;
  warmupMs;
  windowMs;
  minimumRate;
  minimumBytes;
  now;
  startedAt = null;
  buffer = "";
  decoder = new TextDecoder();
  samples = [];
  protectedPhase = false;
  constructor(options = {}) {
    this.enabled = options.enabled === true;
    this.warmupMs = Math.max(0, Math.floor(options.warmupMs ?? 3e4));
    this.windowMs = Math.max(1, Math.floor(options.windowMs ?? 3e4));
    this.minimumRate = Math.max(0, options.minUsefulBytesPerSecond ?? 1);
    this.minimumBytes = Math.max(1, Math.floor(options.minUsefulBytes ?? 1));
    this.now = options.now ?? (() => Date.now());
  }
  observe(chunk) {
    const at = this.now();
    if (this.startedAt === null) this.startedAt = at;
    if (!this.enabled) return this.decision(false, 0);
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    const events = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = events.pop() ?? "";
    let useful = 0;
    for (const event of events) {
      const parsed = parseEvent(event);
      useful += parsed.usefulBytes;
      if (parsed.protectedPhase) this.protectedPhase = true;
      if (parsed.usefulBytes > 0) this.protectedPhase = false;
    }
    if (useful > 0) this.samples.push({ at, bytes: useful });
    const cutoff = at - this.windowMs;
    this.samples = this.samples.filter((sample) => sample.at >= cutoff);
    const windowBytes = this.samples.reduce((sum, sample) => sum + sample.bytes, 0);
    const elapsed = at - (this.startedAt ?? at);
    const rate = windowBytes / Math.max(1, this.windowMs / 1e3);
    const ready = elapsed >= this.warmupMs + this.windowMs;
    const measurable = windowBytes === 0 || windowBytes >= this.minimumBytes;
    const abort = ready && !this.protectedPhase && measurable && rate < this.minimumRate;
    return this.decision(abort, windowBytes, rate);
  }
  decision(abort, usefulBytes, rateBytesPerSecond = 0) {
    return {
      abort,
      reason: abort ? "throughput_too_low" : void 0,
      usefulBytes,
      rateBytesPerSecond,
      protectedPhase: this.protectedPhase
    };
  }
}
function createThroughputWatchdog(options = {}) {
  return new ThroughputWatchdog(options);
}
export {
  ThroughputWatchdog,
  ThroughputWatchdogError,
  createThroughputWatchdog
};
