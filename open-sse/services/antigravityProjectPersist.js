import { updateProviderConnection } from "../utils/omni/dbProviders.js";
function preferAntigravityConnectionsWithStoredProject(connections) {
  if (!Array.isArray(connections) || connections.length === 0) return connections;
  const hasStoredProject = (connection) => {
    if (typeof connection.projectId === "string" && connection.projectId.trim()) return true;
    let psd = connection.providerSpecificData;
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
  const hasHealthySibling = (connection) => connections.some(
    (other) => other !== connection && other.errorCode !== "missing_project_id"
  );
  const candidates = connections.filter(
    (connection) => connection.errorCode !== "missing_project_id" || !hasHealthySibling(connection) || !hasStoredProject(connection)
  );
  const withStoredProject = candidates.filter(hasStoredProject);
  if (withStoredProject.length > 0) return withStoredProject;
  return candidates.length > 0 ? candidates : connections;
}
async function persistDiscoveredAntigravityProjectId(connectionId, discoveredProjectId, existingProviderSpecificData) {
  if (!connectionId || !discoveredProjectId) return;
  try {
    await updateProviderConnection(connectionId, {
      projectId: discoveredProjectId,
      providerSpecificData: {
        ...existingProviderSpecificData || {},
        projectId: discoveredProjectId
      }
    });
  } catch {
  }
}
export {
  persistDiscoveredAntigravityProjectId,
  preferAntigravityConnectionsWithStoredProject
};
