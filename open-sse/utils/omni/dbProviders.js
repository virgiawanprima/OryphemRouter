// Adapted from OmniRoute `@/lib/db/providers` (deep app infra).
// OryphemRouter stores provider connections in src/lib/db/repos/connectionsRepo.js,
// re-exported through src/lib/db/index.js. Loaded lazily; any failure degrades
// to a no-op so persistence failures never block in-flight requests.
//
// unified by integration — canonical provider-connections facade for
// open-sse/utils/omni. Exports consumed by importers (mcp-server/catalog.js,
// services/antigravityProjectPersistence.js, services/antigravityProjectPersist.js,
// services/alibabaFreeTier*.js) are present: getProviderConnections,
// updateProviderConnection.
import { log as engineLog, sanitize } from "../log.js";
let dbModule = null;
let dbLoadFailed = false;

async function loadDb() {
  if (dbModule) return dbModule;
  if (dbLoadFailed) return null;
  try {
    dbModule = await import("../../../src/lib/db/index.js");
  } catch (err) {
    dbLoadFailed = true;
    engineLog.warn("OMNI-DB", "db unavailable:", sanitize(err?.message || err));
    return null;
  }
  return dbModule;
}

export async function updateProviderConnection(id, data) {
  try {
    const db = await loadDb();
    if (!db || typeof db.updateProviderConnection !== "function") return null;
    return await db.updateProviderConnection(id, data);
  } catch {
    return null;
  }
}

export async function getProviderConnections(filter = {}) {
  try {
    const db = await loadDb();
    if (!db || typeof db.getProviderConnections !== "function") return [];
    return await db.getProviderConnections(filter);
  } catch {
    return [];
  }
}
