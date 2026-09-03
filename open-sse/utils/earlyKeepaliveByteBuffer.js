const MAX_ITEMS_PER_CORRELATION = 200;
const ENTRY_TTL_MS = 10 * 60 * 1e3;
const buffers = /* @__PURE__ */ new Map();
function sweepExpired() {
  const cutoff = Date.now() - ENTRY_TTL_MS;
  for (const [correlationId, entry] of buffers) {
    if (entry.createdAt < cutoff) {
      buffers.delete(correlationId);
    }
  }
}
function recordEarlyKeepaliveBytes(correlationId, chunk) {
  if (!correlationId || !chunk) return;
  sweepExpired();
  let entry = buffers.get(correlationId);
  if (!entry) {
    entry = { chunks: [], createdAt: Date.now() };
    buffers.set(correlationId, entry);
  }
  if (entry.chunks.length < MAX_ITEMS_PER_CORRELATION) {
    entry.chunks.push(chunk);
  }
}
function takeEarlyKeepaliveBytes(correlationId) {
  sweepExpired();
  const entry = buffers.get(correlationId);
  if (!entry) return [];
  buffers.delete(correlationId);
  return entry.chunks;
}
export {
  recordEarlyKeepaliveBytes,
  takeEarlyKeepaliveBytes
};
