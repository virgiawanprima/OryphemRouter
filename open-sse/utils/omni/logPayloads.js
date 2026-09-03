// ADAPTED STUB — ported from OmniRoute src/lib/logPayloads.ts
// Only `cloneLogPayload` is needed (by streamPayloadCollector.js). Verbatim port.
export function cloneLogPayload(value) {
  if (value === null || value === undefined) return value;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

// Added for chatCore/nonStreamingResponseParse.ts port: truncate a raw payload
// for logging purposes (keeps unbounded bodies from flooding the log store).
export function normalizePayloadForLog(value, maxChars = 100_000) {
  if (typeof value !== "string") return value;
  return value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value;
}
