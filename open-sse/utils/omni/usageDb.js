// ADAPTED STUB — ported from OmniRoute src/lib/usageDb.ts (call-log surface).
// unified by integration — this is the canonical usage/call-log facade for the
// ported open-sse tree. `saveCallLog` is used by segmindClient.js; the other
// stubs (trackPendingRequest, appendRequestLog, saveRequestDetail,
// saveRequestUsage) satisfy the STATIC top-level imports in the pre-existing
// open-sse/utils/stream.js and open-sse/handlers/chatCore/*.js files, which
// previously imported `@/lib/usageDb.js` (an alias that does not resolve under
// plain Node ESM). All are no-ops: OryphemRouter's usage/call-log surface is
// optional, so persistence failures never block in-flight requests. Accepts
// the same arguments as the original for drop-in compatibility.
export async function saveCallLog(_entry) {
  return undefined;
}

export async function trackPendingRequest(_model, _provider, _connectionId, _active) {
  return undefined;
}

export async function appendRequestLog(_entry) {
  return undefined;
}

export async function saveRequestDetail(_detail) {
  return undefined;
}

export async function saveRequestUsage(_usage) {
  return undefined;
}

export default { saveCallLog, trackPendingRequest, appendRequestLog, saveRequestDetail, saveRequestUsage };
