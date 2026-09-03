import { createHash } from "node:crypto";
import { estimateCompressionTokens } from "./stats.js";
const MAX_ENTRIES = 100;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const DEFAULT_TTL_MINUTES = 5;
const STABLE_PREFIX_FIELDS = [
  "system",
  "systemInstruction",
  "system_instruction",
  "instructions",
  "tools",
  "tool_choice"
];
const entries = /* @__PURE__ */ new Map();
let totalBytes = 0;
function serialize(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}
function digest(value) {
  const serialized = serialize(value);
  return serialized === null ? null : createHash("sha256").update(serialized).digest("hex");
}
function cloneItems(items) {
  try {
    return structuredClone(items);
  } catch {
    const serialized = serialize(items);
    if (serialized === null) return null;
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }
}
function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch {
    const serialized = serialize(value);
    if (serialized === null) return null;
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }
}
function pickStableFields(body) {
  const fields = {};
  for (const field of STABLE_PREFIX_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) fields[field] = body[field];
  }
  return cloneValue(fields);
}
function sequenceField(body) {
  if (Array.isArray(body.messages)) return "messages";
  if (Array.isArray(body.input)) return "input";
  return null;
}
function isToolOutputItem(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  return item.role === "tool" || item.role === "function" || item.role === "tool_result" || item.type === "function_call_output" || item.type === "local_shell_call_output" || item.type === "apply_patch_call_output" || item.type === "computer_call_output" || item.type === "tool_result";
}
function makeKey(options, field) {
  const principal = options.principalId?.trim();
  const session = options.sessionId?.trim();
  const variant = digest(options.variant);
  if (!principal || !session || !variant) return null;
  return `${principal}:${session}:${field}:${variant}`;
}
function deleteEntry(key) {
  const existing = entries.get(key);
  if (!existing) return;
  totalBytes -= existing.bytes;
  entries.delete(key);
}
function prune(now) {
  for (const [key, entry] of entries) {
    if (now >= entry.expiresAt) deleteEntry(key);
  }
  while (entries.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    const oldest = entries.keys().next().value;
    if (!oldest) break;
    deleteEntry(oldest);
  }
}
function store(key, rawItemDigests, rawStableFieldsDigest, result, field, now, ttlMs) {
  const transformedItems = result.body[field];
  if (!Array.isArray(transformedItems)) return;
  const transformedPrefix = cloneItems(transformedItems);
  const transformedStableFields = pickStableFields(result.body);
  const stats = cloneValue(result.stats);
  if (!transformedPrefix || !transformedStableFields) return;
  const serialized = serialize({ transformedPrefix, transformedStableFields, stats });
  if (serialized === null) return;
  const bytes = Buffer.byteLength(serialized, "utf8") + rawItemDigests.length * 64;
  if (bytes > MAX_ENTRY_BYTES) return;
  deleteEntry(key);
  entries.set(key, {
    rawItemDigests,
    rawStableFieldsDigest,
    transformedPrefix,
    transformedStableFields,
    stats,
    lastAccess: now,
    expiresAt: now + ttlMs,
    bytes
  });
  totalBytes += bytes;
  prune(now);
}
function hasExactRawPrefix(rawItemDigests, entry) {
  if (rawItemDigests.length < entry.rawItemDigests.length) return false;
  for (let index = 0; index < entry.rawItemDigests.length; index++) {
    if (rawItemDigests[index] !== entry.rawItemDigests[index]) return false;
  }
  return true;
}
function restoreStableFields(body, stableFields) {
  const restored = cloneValue(stableFields);
  return restored ? { ...body, ...restored } : null;
}
function withLiveZoneStats(body, result, frozenItems, liveItems) {
  const originalTokens = estimateCompressionTokens(body);
  const compressedTokens = estimateCompressionTokens(result.body);
  const savingsPercent = originalTokens > 0 ? Math.max(
    0,
    Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100
  ) : 0;
  const base = result.stats;
  const stats = {
    ...base ?? {
      techniquesUsed: [],
      mode: "stacked",
      timestamp: Date.now()
    },
    originalTokens,
    compressedTokens,
    savingsPercent,
    techniquesUsed: [.../* @__PURE__ */ new Set([...base?.techniquesUsed ?? [], "live-zone-prefix-reuse"])],
    liveZone: {
      cacheHit: true,
      frozenItems,
      liveItems
    }
  };
  return {
    ...result,
    compressed: result.compressed || compressedTokens < originalTokens,
    stats
  };
}
function hasGlobalHardBudget(variant) {
  if (!variant || typeof variant !== "object") return false;
  const config = variant.config;
  if (!config || typeof config !== "object") return false;
  const record = config;
  return record.targetTokens != null || record.targetRatio != null;
}
function resolveLiveZoneContext(body, options) {
  const field = sequenceField(body);
  const key = field ? makeKey(options, field) : null;
  if (!field || !key) return null;
  const rawItems = body[field];
  const rawItemDigests = rawItems.map(digest);
  if (rawItemDigests.some((value) => value === null)) return null;
  const rawStableFieldsDigest = digest(pickStableFields(body));
  if (!rawStableFieldsDigest) return null;
  const ttlMinutes = Math.min(60, Math.max(1, options.ttlMinutes ?? DEFAULT_TTL_MINUTES));
  const now = Date.now();
  return {
    field,
    key,
    rawItems,
    rawItemDigests,
    rawStableFieldsDigest,
    ttlMs: ttlMinutes * 6e4,
    now
  };
}
async function compressAndStore(body, context, compress) {
  const result = await compress(body);
  store(
    context.key,
    context.rawItemDigests,
    context.rawStableFieldsDigest,
    result,
    context.field,
    context.now,
    context.ttlMs
  );
  return result;
}
async function compressLiveToolOutputs(body, field, liveItems, previousStats, compress) {
  const transformedLive = cloneItems(liveItems);
  if (!transformedLive) return null;
  const liveToolIndexes = liveItems.flatMap(
    (item, index) => isToolOutputItem(item) ? [index] : []
  );
  if (liveToolIndexes.length === 0) {
    return { liveResult: { body, compressed: false, stats: previousStats }, transformedLive };
  }
  const liveToolItems = liveToolIndexes.map((index) => liveItems[index]);
  const liveResult = await compress({ ...body, [field]: liveToolItems });
  const transformed = liveResult.body[field];
  if (!Array.isArray(transformed) || transformed.length !== liveToolItems.length) {
    return { liveResult: { body, compressed: false, stats: null }, transformedLive };
  }
  for (let index = 0; index < liveToolIndexes.length; index++) {
    transformedLive[liveToolIndexes[index]] = transformed[index];
  }
  return { liveResult, transformedLive };
}
async function reuseLiveZoneEntry(body, context, previous, compress) {
  entries.delete(context.key);
  previous.lastAccess = context.now;
  entries.set(context.key, previous);
  const frozenItems = previous.rawItemDigests.length;
  const liveItems = context.rawItems.slice(frozenItems);
  const frozenPrefix = cloneItems(previous.transformedPrefix);
  if (!frozenPrefix) return compress(body);
  const live = await compressLiveToolOutputs(
    body,
    context.field,
    liveItems,
    previous.stats,
    compress
  );
  if (!live) return compress(body);
  const restoredBody = restoreStableFields(live.liveResult.body, previous.transformedStableFields);
  if (!restoredBody) return compress(body);
  const combinedBody = {
    ...restoredBody,
    [context.field]: [...frozenPrefix, ...live.transformedLive]
  };
  const combinedResult = withLiveZoneStats(
    body,
    { ...live.liveResult, body: combinedBody },
    frozenItems,
    liveItems.length
  );
  if (entries.get(context.key) === previous) {
    store(
      context.key,
      context.rawItemDigests,
      context.rawStableFieldsDigest,
      combinedResult,
      context.field,
      Date.now(),
      context.ttlMs
    );
  }
  return combinedResult;
}
async function applyLiveZoneCompression(body, options, compress) {
  if (hasGlobalHardBudget(options.variant)) return compress(body);
  const context = resolveLiveZoneContext(body, options);
  if (!context) return compress(body);
  prune(context.now);
  const previous = entries.get(context.key);
  if (!previous || previous.rawStableFieldsDigest !== context.rawStableFieldsDigest || !hasExactRawPrefix(context.rawItemDigests, previous)) {
    return compressAndStore(body, context, compress);
  }
  return reuseLiveZoneEntry(body, context, previous, compress);
}
function resetLiveZoneCache() {
  entries.clear();
  totalBytes = 0;
}
function getLiveZoneCacheStats() {
  return { entries: entries.size, bytes: totalBytes };
}
export {
  applyLiveZoneCompression,
  getLiveZoneCacheStats,
  resetLiveZoneCache
};
