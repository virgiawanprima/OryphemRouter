import crypto from "node:crypto";
import {
  deleteAllCcrBlocks,
  deleteCcrBlockRow,
  loadCcrBlock,
  persistCcrBlock,
  touchCcrBlock
} from "../../../../utils/omni/ccrBlocksDb.js";
import { createCompressionStats } from "../../stats.js";
import { queryBlock } from "./ccrQuery.js";
import { callerSupportsCcrRetrieve, injectCcrProtocolInstruction } from "./protocolInstruction.js";
import { log as engineLog, sanitize } from "../../../../utils/log.js";
const ENGINE_ID = "ccr";
const DEFAULT_MIN_CHARS = 600;
const RETRIEVAL_THRESHOLD = 3;
const RETRIEVAL_RAMP_FACTOR_DEFAULT = 2;
const MAX_CCR_ENTRIES = 5e3;
const MAX_CCR_BLOCK_BYTES = 2 * 1024 * 1024;
const MAX_CCR_PRINCIPAL_BYTES = 16 * 1024 * 1024;
const MAX_CCR_GLOBAL_BYTES = 64 * 1024 * 1024;
const DEFAULT_CCR_TTL_SECONDS = 24 * 60 * 60;
const MAX_CCR_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_CCR_MCP_FULL_BYTES = 256 * 1024;
function isCcrStoreRejection(result) {
  return result.stored === false;
}
const ccrStore = /* @__PURE__ */ new Map();
const retrievalCounts = /* @__PURE__ */ new Map();
const principalBytesMap = /* @__PURE__ */ new Map();
let ccrTotalBytes = 0;
const lifecycleByPrincipal = /* @__PURE__ */ new Map();
const ANON = "__anon__";
function buildStoreKey(hash, principalId) {
  return `${principalId ?? ANON} ${hash}`;
}
const MAX_DURABLE_BLOCK_BYTES = 512 * 1024;
const isCloudRuntime = typeof globalThis.caches === "object" && globalThis.caches !== null;
function durableTierEnabled() {
  return !isCloudRuntime && process.env.COMPRESSION_CCR_DURABLE_STORE !== "false";
}
const loggedDurableErrors = /* @__PURE__ */ new Set();
function warnDurableError(operation, error) {
  if (process.env.NODE_ENV === "test") return;
  if (loggedDurableErrors.has(operation)) return;
  if (loggedDurableErrors.size >= 20) {
    const first = loggedDurableErrors.values().next().value;
    if (first !== void 0) loggedDurableErrors.delete(first);
  }
  loggedDurableErrors.add(operation);
  const message = error instanceof Error ? error.message : String(error);
  engineLog.warn("CCR", `durable ${operation} failed: ${sanitize(message)}`);
}
const MAX_PENDING_DURABLE_WRITES = 1e3;
let pendingDurableWrites = 0;
let droppedDurableWrites = 0;
function deferDurable(operation, work, droppable = false) {
  if (droppable && pendingDurableWrites >= MAX_PENDING_DURABLE_WRITES) {
    droppedDurableWrites++;
    return;
  }
  pendingDurableWrites++;
  setImmediate(() => {
    pendingDurableWrites--;
    try {
      work();
    } catch (error) {
      warnDurableError(operation, error);
    }
  });
}
function persistEntry(entry) {
  if (!durableTierEnabled()) return;
  if (entry.bytes > MAX_DURABLE_BLOCK_BYTES) return;
  const snapshot = { ...entry };
  deferDurable("persist", () => persistCcrBlock(snapshot), true);
}
function forgetEntry(hash, principalId) {
  if (!durableTierEnabled()) return;
  deferDurable("delete", () => deleteCcrBlockRow(principalId, hash));
}
function rehydrateEntry(hash, principalId, now) {
  if (!durableTierEnabled()) return null;
  let row;
  try {
    row = loadCcrBlock(principalId, hash, now);
  } catch (error) {
    warnDurableError("load", error);
    return null;
  }
  if (!row) return null;
  const entry = {
    hash: row.hash,
    principalId: row.principalId,
    content: row.content,
    bytes: row.bytes,
    chars: row.chars,
    lines: row.lines,
    contentType: row.contentType,
    source: row.source,
    createdAt: row.createdAt,
    lastAccessedAt: now,
    expiresAt: row.expiresAt
  };
  if (enforcePrincipalBudget(entry.principalId, entry.bytes) && enforceGlobalBudget(entry.principalId, entry.bytes)) {
    const key = buildStoreKey(hash, principalId === ANON ? void 0 : principalId);
    ccrStore.set(key, entry);
    ccrTotalBytes += entry.bytes;
    principalBytesMap.set(entry.principalId, principalBytes(entry.principalId) + entry.bytes);
  }
  try {
    touchCcrBlock(entry.principalId, hash, now);
  } catch (error) {
    warnDurableError("touch", error);
  }
  return entry;
}
function readLifecycleCounters(principalId) {
  return lifecycleByPrincipal.get(principalId) ?? {
    expiredEvictions: 0,
    capacityEvictions: 0,
    rejectedStores: 0
  };
}
function mutableLifecycleCounters(principalId) {
  const existing = lifecycleByPrincipal.get(principalId);
  if (existing) return existing;
  const counters = { expiredEvictions: 0, capacityEvictions: 0, rejectedStores: 0 };
  lifecycleByPrincipal.set(principalId, counters);
  return counters;
}
function publicMetadata(entry) {
  const { principalId: _principalId, content: _content, ...metadata } = entry;
  return {
    ...metadata,
    retrievalCount: retrievalCounts.get(buildStoreKey(entry.hash, entry.principalId)) ?? 0
  };
}
function setRetrievalCount(key, count) {
  if (!retrievalCounts.has(key) && retrievalCounts.size >= MAX_CCR_ENTRIES) {
    const oldestKey = retrievalCounts.keys().next().value;
    if (oldestKey !== void 0) retrievalCounts.delete(oldestKey);
  }
  retrievalCounts.delete(key);
  retrievalCounts.set(key, count);
}
function removeEntry(key, reason) {
  const entry = ccrStore.get(key);
  if (!entry) return false;
  ccrStore.delete(key);
  ccrTotalBytes = Math.max(0, ccrTotalBytes - entry.bytes);
  const remainingPrincipalBytes = Math.max(
    0,
    (principalBytesMap.get(entry.principalId) ?? 0) - entry.bytes
  );
  if (remainingPrincipalBytes === 0) principalBytesMap.delete(entry.principalId);
  else principalBytesMap.set(entry.principalId, remainingPrincipalBytes);
  const counters = mutableLifecycleCounters(entry.principalId);
  if (reason === "expired") {
    counters.expiredEvictions++;
    forgetEntry(entry.hash, entry.principalId);
  }
  if (reason === "capacity") counters.capacityEvictions++;
  return true;
}
function purgeExpired(now = Date.now()) {
  for (const [key, entry] of ccrStore) {
    if (entry.expiresAt <= now) removeEntry(key, "expired");
  }
}
function getActiveEntry(key, now = Date.now()) {
  const entry = ccrStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    removeEntry(key, "expired");
    return null;
  }
  return entry;
}
function principalBytes(principalId) {
  return principalBytesMap.get(principalId) ?? 0;
}
function evictOldestMatching(predicate) {
  for (const [key, entry] of ccrStore) {
    if (predicate(entry)) return removeEntry(key, "capacity");
  }
  return false;
}
function normalizeTtlSeconds(value) {
  if (!Number.isFinite(value) || value === void 0) return DEFAULT_CCR_TTL_SECONDS;
  return Math.max(60, Math.min(MAX_CCR_TTL_SECONDS, Math.floor(value)));
}
function hashContent(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}
function rejectStore(hash, owner, reason) {
  mutableLifecycleCounters(owner).rejectedStores++;
  return { stored: false, hash, reason };
}
function enforcePrincipalBudget(owner, bytes) {
  while (principalBytes(owner) + bytes > MAX_CCR_PRINCIPAL_BYTES && evictOldestMatching((entry) => entry.principalId === owner)) {
  }
  return principalBytes(owner) + bytes <= MAX_CCR_PRINCIPAL_BYTES;
}
function enforceGlobalBudget(owner, bytes) {
  const overBudget = () => ccrStore.size >= MAX_CCR_ENTRIES || ccrTotalBytes + bytes > MAX_CCR_GLOBAL_BYTES;
  while (overBudget()) {
    if (evictOldestMatching((entry) => entry.principalId === owner)) continue;
    if (evictOldestMatching(() => true)) continue;
    break;
  }
  return ccrTotalBytes + bytes <= MAX_CCR_GLOBAL_BYTES;
}
function tryStoreBlock(text, principalId, options = {}) {
  const hash = hashContent(text);
  const owner = principalId ?? ANON;
  const key = buildStoreKey(hash, principalId);
  const now = options.now ?? Date.now();
  purgeExpired(now);
  const existing = ccrStore.get(key);
  if (existing) {
    existing.lastAccessedAt = now;
    existing.expiresAt = now + normalizeTtlSeconds(options.ttlSeconds) * 1e3;
    ccrStore.delete(key);
    ccrStore.set(key, existing);
    return { stored: true, hash, metadata: publicMetadata(existing) };
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_CCR_BLOCK_BYTES) {
    return rejectStore(hash, owner, "block_too_large");
  }
  if (!enforcePrincipalBudget(owner, bytes)) {
    return rejectStore(hash, owner, "principal_budget_exceeded");
  }
  if (!enforceGlobalBudget(owner, bytes)) {
    return rejectStore(hash, owner, "global_budget_exceeded");
  }
  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds);
  const entry = {
    hash,
    principalId: owner,
    content: text,
    bytes,
    chars: text.length,
    lines: text.length === 0 ? 0 : text.split("\n").length,
    contentType: options.contentType?.trim().slice(0, 128) || "text/plain",
    source: options.source ?? "compression",
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlSeconds * 1e3
  };
  ccrStore.set(key, entry);
  ccrTotalBytes += bytes;
  principalBytesMap.set(owner, principalBytes(owner) + bytes);
  persistEntry(entry);
  return { stored: true, hash, metadata: publicMetadata(entry) };
}
function storeBlock(text, principalId, options = {}) {
  const result = tryStoreBlock(text, principalId, options);
  if (isCcrStoreRejection(result)) {
    throw new RangeError(`CCR store rejected block: ${result.reason}`);
  }
  return result.hash;
}
function retrieveBlock(hash, principalId, now = Date.now()) {
  const key = buildStoreKey(hash, principalId);
  const entry = getActiveEntry(key, now);
  if (!entry) {
    const restored = rehydrateEntry(hash, principalId ?? ANON, now);
    return restored ? restored.content : null;
  }
  entry.lastAccessedAt = now;
  ccrStore.delete(key);
  ccrStore.set(key, entry);
  return entry.content;
}
function recordRetrieval(hash, principalId) {
  const key = buildStoreKey(hash, principalId);
  setRetrievalCount(key, (retrievalCounts.get(key) ?? 0) + 1);
}
function shouldSkipCompression(hash, principalId) {
  const key = buildStoreKey(hash, principalId);
  return (retrievalCounts.get(key) ?? 0) >= RETRIEVAL_THRESHOLD;
}
function effectiveMinChars(baseMinChars, hash, principalId, rampFactor) {
  const count = retrievalCounts.get(buildStoreKey(hash, principalId)) ?? 0;
  if (count >= RETRIEVAL_THRESHOLD) return Number.POSITIVE_INFINITY;
  if (count <= 0 || rampFactor <= 1) return baseMinChars;
  return Math.round(baseMinChars * (1 + (rampFactor - 1) * count));
}
function resolveRetrievalRampFactor(env = process.env) {
  const raw = env.COMPRESSION_CCR_RETRIEVAL_RAMP_FACTOR;
  if (raw === void 0) return RETRIEVAL_RAMP_FACTOR_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : RETRIEVAL_RAMP_FACTOR_DEFAULT;
}
function resetCcrStore() {
  ccrStore.clear();
  retrievalCounts.clear();
  principalBytesMap.clear();
  ccrTotalBytes = 0;
  lifecycleByPrincipal.clear();
  deferDurable("reset", deleteAllCcrBlocks);
}
function flushCcrDurableWrites() {
  return new Promise((resolve) => setImmediate(resolve));
}
function inspectCcrBlock(hash, principalId, now = Date.now()) {
  const entry = getActiveEntry(buildStoreKey(hash, principalId), now);
  return entry ? publicMetadata(entry) : null;
}
function listCcrBlocks(principalId, options = {}) {
  purgeExpired(options.now);
  const owner = principalId ?? ANON;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)));
  const all = [];
  for (const entry of ccrStore.values()) {
    if (entry.principalId === owner) all.push(publicMetadata(entry));
  }
  all.reverse();
  return {
    entries: all.slice(offset, offset + limit),
    total: all.length,
    offset,
    limit,
    hasMore: offset + limit < all.length
  };
}
function deleteCcrBlock(hash, principalId, _now = Date.now()) {
  const removedFromCache = removeEntry(buildStoreKey(hash, principalId));
  forgetEntry(hash, principalId ?? ANON);
  return removedFromCache;
}
function getCcrStoreStats(principalId, now = Date.now()) {
  purgeExpired(now);
  const owner = principalId ?? ANON;
  const entries = Array.from(ccrStore.values()).filter((entry) => entry.principalId === owner);
  return {
    storage: "memory",
    entries: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    limits: {
      maxEntries: MAX_CCR_ENTRIES,
      maxBlockBytes: MAX_CCR_BLOCK_BYTES,
      maxPrincipalBytes: MAX_CCR_PRINCIPAL_BYTES,
      maxGlobalBytes: MAX_CCR_GLOBAL_BYTES,
      defaultTtlSeconds: DEFAULT_CCR_TTL_SECONDS,
      maxTtlSeconds: MAX_CCR_TTL_SECONDS,
      maxMcpFullBytes: MAX_CCR_MCP_FULL_BYTES
    },
    lifecycle: { ...readLifecycleCounters(owner) }
  };
}
function handleCcrRetrieve(args, callerId) {
  if (!args.hash || typeof args.hash !== "string") {
    return { error: "hash parameter is required and must be a string" };
  }
  const block = retrieveBlock(args.hash, callerId);
  if (block === null) {
    return {
      error: `CCR block not found for hash=${args.hash}. The block may have expired or the hash is invalid.`
    };
  }
  recordRetrieval(args.hash, callerId);
  if (!args.mode || args.mode === "full") return { content: block };
  return queryBlock(block, args);
}
function buildCcrMarker(hash, charCount) {
  return `[CCR retrieve hash=${hash} chars=${charCount}]`;
}
function buildCcrReference(hash, charCount) {
  return { hash, uri: `ccr://${hash}`, marker: buildCcrMarker(hash, charCount) };
}
const MARKER_PREAMBLE_CHARS = 200;
function buildCcrReplacementText(text, marker) {
  const preamble = text.slice(0, MARKER_PREAMBLE_CHARS).trimEnd();
  return `${preamble}\u2026 ${marker}`;
}
function maybeCcrReplace(text, minChars, principalId, rampFactor) {
  if (text.length < minChars) {
    return { text, replaced: false, hash: null };
  }
  const hash = hashContent(text);
  if (text.length < effectiveMinChars(minChars, hash, principalId, rampFactor)) {
    return { text, replaced: false, hash: null };
  }
  const marker = buildCcrMarker(hash, text.length);
  const replacement = buildCcrReplacementText(text, marker);
  if (replacement.length >= text.length) {
    return { text, replaced: false, hash: null };
  }
  const stored = tryStoreBlock(text, principalId, { source: "compression" });
  if (!stored.stored) return { text, replaced: false, hash: null };
  return { text: replacement, replaced: true, hash };
}
function processMessages(messages, minChars, principalId, rampFactor) {
  let replacedCount = 0;
  const result = messages.map((msg) => {
    if (msg.role === "system") return { ...msg };
    if (msg.role === "tool") return { ...msg };
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const parts = msg.content;
      if (parts.length > 0 && parts.every((p) => p?.["type"] === "tool_result")) {
        return { ...msg };
      }
    }
    if (typeof msg.content === "string") {
      const { text, replaced } = maybeCcrReplace(msg.content, minChars, principalId, rampFactor);
      if (replaced) {
        replacedCount++;
        return { ...msg, content: text };
      }
      return { ...msg };
    }
    if (Array.isArray(msg.content)) {
      let changed = false;
      const newContent = msg.content.map((part) => {
        if (part?.["type"] !== "text" || typeof part?.["text"] !== "string") return part;
        const { text, replaced } = maybeCcrReplace(
          part["text"],
          minChars,
          principalId,
          rampFactor
        );
        if (replaced) {
          changed = true;
          replacedCount++;
          return { ...part, text };
        }
        return part;
      });
      if (changed) {
        return { ...msg, content: newContent };
      }
      return { ...msg };
    }
    return { ...msg };
  });
  return { messages: result, replacedCount };
}
const CCR_SCHEMA = [
  {
    key: "enabled",
    type: "boolean",
    label: "Enabled",
    defaultValue: true
  },
  {
    key: "minChars",
    type: "number",
    label: "Minimum block characters",
    description: "Minimum character count for a block to be a CCR candidate.",
    defaultValue: DEFAULT_MIN_CHARS,
    min: 100,
    max: 1e6
  },
  {
    key: "retrievalRampFactor",
    type: "number",
    label: "Retrieval ramp factor (H8)",
    description: "How steeply frequently-retrieved blocks resist compression. Each prior retrieval raises the effective minimum block size linearly; 1 disables the ramp (binary skip at the threshold only).",
    defaultValue: RETRIEVAL_RAMP_FACTOR_DEFAULT,
    min: 1,
    max: 100
  }
];
function validateCcrConfig(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  if (config["minChars"] !== void 0) {
    const v = config["minChars"];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
      errors.push("minChars must be a positive number");
    }
  }
  if (config["retrievalRampFactor"] !== void 0) {
    const v = config["retrievalRampFactor"];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1) {
      errors.push("retrievalRampFactor must be a number >= 1");
    }
  }
  return { valid: errors.length === 0, errors };
}
const ccrEngine = {
  id: ENGINE_ID,
  name: "CCR (Content-Compression-Retrieve)",
  description: "Replaces large blocks of text with content-addressed retrieve markers `[CCR retrieve hash=<24hex> chars=N]`. The original block is stored and retrievable via the `omniroute_ccr_retrieve` MCP tool (H4). Store is principal-scoped: only the storing principal can retrieve their blocks.",
  icon: "archive",
  targets: ["messages"],
  stackable: true,
  // stackPriority 4 = runs just after session-dedup (3), before headroom (15),
  // caveman (20), aggressive (30), ultra (40).
  stackPriority: 4,
  metadata: {
    id: ENGINE_ID,
    name: "CCR (Content-Compression-Retrieve)",
    description: "Reversible compression: large blocks \u2192 retrieve marker. Original retrievable via MCP tool (H4). Principal-scoped for tenant isolation.",
    inputScope: "messages",
    targetLatencyMs: 1,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] === false) {
      return { body, compressed: false, stats: null };
    }
    let callerCanRetrieve = false;
    try {
      callerCanRetrieve = callerSupportsCcrRetrieve(body);
    } catch (err) {
      engineLog.warn(
        "CCR",
        "callerSupportsCcrRetrieve threw; skipping compression:",
        sanitize(err instanceof Error ? err.message : err)
      );
      callerCanRetrieve = false;
    }
    if (!callerCanRetrieve) {
      return { body, compressed: false, stats: null };
    }
    const minChars = typeof stepConfig["minChars"] === "number" ? stepConfig["minChars"] : DEFAULT_MIN_CHARS;
    const rampFactor = typeof stepConfig["retrievalRampFactor"] === "number" ? stepConfig["retrievalRampFactor"] : resolveRetrievalRampFactor();
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const start = performance.now();
    const { messages: newMessages, replacedCount } = processMessages(
      messages,
      minChars,
      options?.principalId,
      rampFactor
    );
    if (replacedCount === 0) {
      return { body, compressed: false, stats: null };
    }
    const messagesWithProtocol = injectCcrProtocolInstruction(newMessages, body);
    const newBody = { ...body, messages: messagesWithProtocol };
    const durationMs = Math.round(performance.now() - start);
    const stats = createCompressionStats(
      body,
      newBody,
      "stacked",
      ["ccr"],
      [`ccr-replaced-${replacedCount}-blocks`],
      durationMs
    );
    return { body: newBody, compressed: true, stats };
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return CCR_SCHEMA;
  },
  validateConfig(config) {
    return validateCcrConfig(config);
  }
};
export {
  DEFAULT_CCR_TTL_SECONDS,
  MAX_CCR_BLOCK_BYTES,
  MAX_CCR_ENTRIES,
  MAX_CCR_GLOBAL_BYTES,
  MAX_CCR_MCP_FULL_BYTES,
  MAX_CCR_PRINCIPAL_BYTES,
  MAX_CCR_TTL_SECONDS,
  buildCcrMarker,
  buildCcrReference,
  ccrEngine,
  deleteCcrBlock,
  effectiveMinChars,
  flushCcrDurableWrites,
  getCcrStoreStats,
  handleCcrRetrieve,
  inspectCcrBlock,
  isCcrStoreRejection,
  listCcrBlocks,
  recordRetrieval,
  resetCcrStore,
  resolveRetrievalRampFactor,
  retrieveBlock,
  shouldSkipCompression,
  storeBlock,
  tryStoreBlock
};
