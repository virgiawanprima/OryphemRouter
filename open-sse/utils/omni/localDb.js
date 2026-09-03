// ADAPTATION for OryphemRouter.
// OmniRoute's `@/lib/localDb` is a SQLite-backed local database (sql.js). That is deep app
// infra and intentionally NOT ported. This is an in-memory fallback implementing the
// functions `batchProcessor` consumes, so the module loads and degrades gracefully
// (no persistence across restarts). NOTE: this is a stub — data is not durable.
//
// unified by integration — canonical local-DB facade for open-sse/utils/omni.
// All named exports consumed by importers (batchProcessor.js, networkProxy.js,
// proxyFallback.js) are present: createBatch/getBatch/updateBatch,
// getPendingBatches/getTerminalBatches, createFile/getFileContent/listFiles/deleteFile,
// ensureBatchItemCheckpoints/listBatchItemCheckpoints/countBatchItemCheckpoints,
// markBatchItemProcessing/markBatchItemResult/markBatchItemError, getApiKeyById/createApiKey,
// getProxyConfig/resolveProxyForScopeFromRegistry/listProxies/listOneproxyProxies.

const _batches = new Map(); // id -> record
const _files = new Map(); // id -> content string
const _checkpoints = new Map(); // batchId -> array of checkpoint items
const _apiKeys = new Map(); // id -> { id, apiKey, provider, label }

let _idSeq = 1;
const _nextId = (prefix) => `${prefix}_${Date.now().toString(36)}_${_idSeq++}`;

// ── Batches ─────────────────────────────────────────────────────────────────
export function createBatch(data) {
  const record = { id: _nextId("batch"), status: "pending", createdAt: Date.now(), ...data };
  _batches.set(record.id, record);
  return record;
}

export function getBatch(id) {
  return _batches.get(id) ?? null;
}

export function updateBatch(id, patch) {
  const record = _batches.get(id);
  if (!record) return null;
  Object.assign(record, patch, { updatedAt: Date.now() });
  _batches.set(id, record);
  return record;
}

export function getPendingBatches() {
  return [..._batches.values()].filter((b) => b.status === "pending");
}

export function getTerminalBatches() {
  return [..._batches.values()].filter(
    (b) => b.status === "completed" || b.status === "failed" || b.status === "cancelled"
  );
}

// ── Files ───────────────────────────────────────────────────────────────────
export function createFile({ id, content, ...rest }) {
  const fileId = id ?? _nextId("file");
  _files.set(fileId, content ?? "");
  return { id: fileId, content: content ?? "", ...rest };
}

export function getFileContent(id) {
  return _files.get(id) ?? null;
}

export function listFiles() {
  return [..._files.keys()].map((id) => ({ id }));
}

export function deleteFile(id) {
  return _files.delete(id);
}

// ── Checkpoints ─────────────────────────────────────────────────────────────
export function ensureBatchItemCheckpoints(batchId, items) {
  if (!_checkpoints.has(batchId)) _checkpoints.set(batchId, new Map());
  const map = _checkpoints.get(batchId);
  for (const item of items ?? []) {
    if (!map.has(item.id)) map.set(item.id, { id: item.id, status: "pending", ...item });
  }
  return map.size;
}

export function listBatchItemCheckpoints(batchId) {
  const map = _checkpoints.get(batchId);
  return map ? [...map.values()] : [];
}

export function countBatchItemCheckpoints(batchId) {
  const map = _checkpoints.get(batchId);
  return map ? map.size : 0;
}

export function markBatchItemProcessing(batchId, itemId) {
  const map = _checkpoints.get(batchId);
  const item = map?.get(itemId);
  if (item) { item.status = "processing"; item.startedAt = Date.now(); }
  return item ?? null;
}

export function markBatchItemResult(batchId, itemId, result) {
  const map = _checkpoints.get(batchId);
  const item = map?.get(itemId);
  if (item) { Object.assign(item, result, { status: "completed", completedAt: Date.now() }); }
  return item ?? null;
}

export function markBatchItemError(batchId, itemId, error) {
  const map = _checkpoints.get(batchId);
  const item = map?.get(itemId);
  if (item) { item.status = "failed"; item.error = error; item.failedAt = Date.now(); }
  return item ?? null;
}

// ── API keys ────────────────────────────────────────────────────────────────
export function getApiKeyById(id) {
  return _apiKeys.get(id) ?? null;
}

export function createApiKey(data) {
  const key = { id: _nextId("key"), ...data };
  _apiKeys.set(key.id, key);
  return key;
}

// ── Proxy surface (added for proxyFallback.js / networkProxy.js ports) ──────
/** Read global proxy config. Returns { global, providers }. */
export async function getProxyConfig() {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  return { global: envProxy || null, providers: {} };
}

/** Resolve a proxy record for a scope (e.g. "global"). */
export async function resolveProxyForScopeFromRegistry(_scope) {
  return null;
}

/** List configured proxies. Returns { items: [] }. */
export async function listProxies(_opts) {
  return { items: [] };
}

/** List 1proxy marketplace proxies. Returns []. */
export async function listOneproxyProxies(_opts) {
  return [];
}

// ── Upstream proxy config (added for chatCore/comboContextCache.ts port) ────
/** Upstream proxy config for a provider. Graceful default: native, disabled. */
export async function getUpstreamProxyConfig(_providerId) {
  return {
    mode: "native",
    enabled: false,
    cliproxyapiModelMapping: null,
    fallbackBackend: "cliproxyapi",
  };
}

// ── Combos (added for chatCore/comboContextCache.ts port) ──────────────────
let _combosVersion = 0;
export function invalidateDbCache(key) {
  if (key === "combos") _combosVersion += 1;
}
export async function getCombos() {
  return [];
}
export function getCombosCacheVersion() {
  return _combosVersion;
}
