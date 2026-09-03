import { updateProviderConnection } from "../utils/omni/dbProviders.js";
function extractAntigravityProjectIdFromPayload(data) {
  if (!data || typeof data !== "object") return null;
  const raw = data.cloudaicompanionProject;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const id = raw.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}
function getStoredAntigravityProjectId(connection) {
  const column = typeof connection.projectId === "string" ? connection.projectId.trim() : "";
  if (column) return column;
  const psd = connection.providerSpecificData;
  const fromPsd = typeof psd?.projectId === "string" ? psd.projectId.trim() : "";
  return fromPsd || null;
}
const persistInFlight = /* @__PURE__ */ new Set();
function persistDiscoveredAntigravityProjectId(connectionId, projectId, existingProviderSpecificData) {
  const trimmed = projectId.trim();
  if (!connectionId || !trimmed) return;
  const dedupeKey = `${connectionId}:${trimmed}`;
  if (persistInFlight.has(dedupeKey)) return;
  persistInFlight.add(dedupeKey);
  const providerSpecificData = {
    ...existingProviderSpecificData || {},
    projectId: trimmed
  };
  void updateProviderConnection(connectionId, {
    projectId: trimmed,
    errorCode: null,
    lastError: null,
    lastErrorType: null,
    // #11284: a discovered project proves the account is usable again —
    // re-enable it (markAntigravityMissingCloudCodeProject may have disabled
    // it after a confirmed-missing 422).
    isActive: true,
    testStatus: "active",
    providerSpecificData
  }).catch(() => {
  }).finally(() => {
    persistInFlight.delete(dedupeKey);
  });
}
function markAntigravityMissingCloudCodeProject(connectionId) {
  if (!connectionId) return;
  void updateProviderConnection(connectionId, {
    isActive: false,
    testStatus: "unavailable",
    errorCode: "missing_project_id",
    lastError: "Missing Google projectId for Antigravity account. Reconnect OAuth after completing Gemini Code Assist onboarding.",
    lastErrorType: "oauth_missing_project_id"
  }).catch(() => {
  });
}
function preferAntigravityConnectionsWithStoredProject(connections) {
  if (connections.length <= 1) return connections;
  const hasStoredProject = (connection) => {
    const record = connection;
    if (typeof record.projectId === "string" && record.projectId.trim()) return true;
    let psd = record.providerSpecificData;
    if (typeof psd === "string") {
      try {
        psd = JSON.parse(psd);
      } catch {
        return false;
      }
    }
    if (!psd || typeof psd !== "object") return false;
    const projectId = psd.projectId;
    return typeof projectId === "string" && projectId.trim().length > 0;
  };
  const withoutKnownMissing = connections.filter(
    (connection) => connection.errorCode !== "missing_project_id" || hasStoredProject(connection)
  );
  const pool = withoutKnownMissing.length > 0 ? withoutKnownMissing : connections;
  const withStored = pool.filter(hasStoredProject);
  if (withStored.length > 0 && withStored.length < pool.length) {
    return withStored;
  }
  return pool;
}
function clearAntigravityProjectPersistenceInFlight() {
  persistInFlight.clear();
}
export {
  clearAntigravityProjectPersistenceInFlight,
  extractAntigravityProjectIdFromPayload,
  getStoredAntigravityProjectId,
  markAntigravityMissingCloudCodeProject,
  persistDiscoveredAntigravityProjectId,
  preferAntigravityConnectionsWithStoredProject
};
