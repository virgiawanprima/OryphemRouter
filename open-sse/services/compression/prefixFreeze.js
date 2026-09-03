import crypto from "node:crypto";
const DEFAULT_PREFIX_FREEZE = { enabled: false, threshold: 3 };
const MAX_PREFIX_ENTRIES = 5e3;
const observations = /* @__PURE__ */ new Map();
function boundedInc(hash) {
  if (!observations.has(hash) && observations.size >= MAX_PREFIX_ENTRIES) {
    const oldest = observations.keys().next().value;
    if (oldest !== void 0) observations.delete(oldest);
  }
  observations.set(hash, (observations.get(hash) ?? 0) + 1);
}
function toPositiveInt(raw, fallback) {
  if (raw === void 0) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}
function resolvePrefixFreezeConfig(env = process.env) {
  return {
    enabled: env.COMPRESSION_PREFIX_FREEZE_ENABLED === "true",
    threshold: toPositiveInt(
      env.COMPRESSION_PREFIX_FREEZE_THRESHOLD,
      DEFAULT_PREFIX_FREEZE.threshold
    )
  };
}
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function collectText(value, out) {
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return;
  }
  if (isRecord(value)) {
    if (typeof value.text === "string" && value.text.trim()) out.push(value.text);
    if (value.parts !== void 0) collectText(value.parts, out);
  }
}
function extractStablePrefixHash(body) {
  if (!isRecord(body)) return null;
  const parts = [];
  collectText(body.system, parts);
  collectText(body.systemInstruction, parts);
  collectText(body.system_instruction, parts);
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (isRecord(msg) && msg.role === "system") collectText(msg.content, parts);
    }
  }
  if (parts.length === 0) return null;
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 24);
}
function observePrefix(hash) {
  boundedInc(hash);
}
function isPrefixFrozen(hash, threshold) {
  return (observations.get(hash) ?? 0) >= threshold;
}
function getPrefixObservations(hash) {
  return observations.get(hash) ?? 0;
}
function resetPrefixFreeze() {
  observations.clear();
}
export {
  DEFAULT_PREFIX_FREEZE,
  MAX_PREFIX_ENTRIES,
  extractStablePrefixHash,
  getPrefixObservations,
  isPrefixFrozen,
  observePrefix,
  resetPrefixFreeze,
  resolvePrefixFreezeConfig
};
