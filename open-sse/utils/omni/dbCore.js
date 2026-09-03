// ADAPTED STUB — deep app infra (OmniRoute src/lib/db/core.ts). OryphemRouter has its
// own db layer; these are graceful fallbacks for the mcp-server port.
//
// unified by integration — canonical db-core facade for open-sse/utils/omni.
// Exports consumed by importers (mcp-server/server.js, mcp-server/audit.js,
// services/geminiThoughtSignatureStore.js) are present: getDbInstance,
// isNativeSqliteLoadError. The orphaned parallel port omniDbStub.js re-exports
// from here.
export function isNativeSqliteLoadError(error) {
  return Boolean(error && /SQLITE|database is locked|no such table/i.test(String(error?.message || error)));
}
export async function getDbInstance() {
  return null;
}
