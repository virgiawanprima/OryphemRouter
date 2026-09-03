import { isAccountUnavailable } from "../accountFallback.js";
import { isModelLocked } from "../../utils/omni/accountFallbackExtras.js";
const SYNTHETIC_NOAUTH_CONNECTION_ID = "noauth";
const TERMINAL_CONNECTION_STATUSES = /* @__PURE__ */ new Set([
  "banned",
  "expired",
  "credits_exhausted",
  "deactivated"
]);
function isConnectionResilienceBlocked(connection) {
  if (isAccountUnavailable(connection.rateLimitedUntil)) return true;
  const status = connection.testStatus;
  if (status === "unavailable") return true;
  if (typeof status === "string" && TERMINAL_CONNECTION_STATUSES.has(status)) return true;
  return false;
}
function isConnectionEligibleForModel(provider, connectionId, model, connectionsById) {
  const connection = connectionsById.get(connectionId);
  if (connection && isConnectionResilienceBlocked(connection)) return false;
  return !isModelLocked(provider, connectionId, model);
}
function filterResilienceBlockedCandidates(pool, connectionsById) {
  if (!Array.isArray(pool) || pool.length === 0) return pool;
  let changed = false;
  const filtered = pool.flatMap((candidate) => {
    if (candidate.connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID) {
      if (isModelLocked(candidate.provider, SYNTHETIC_NOAUTH_CONNECTION_ID, candidate.model)) {
        changed = true;
        return [];
      }
      return [candidate];
    }
    if (Array.isArray(candidate.allowedConnectionIds)) {
      const allowedConnectionIds = candidate.allowedConnectionIds.filter(
        (connectionId) => isConnectionEligibleForModel(
          candidate.provider,
          connectionId,
          candidate.model,
          connectionsById
        )
      );
      if (allowedConnectionIds.length === 0) {
        changed = true;
        return [];
      }
      if (allowedConnectionIds.length === candidate.allowedConnectionIds.length) {
        return [candidate];
      }
      changed = true;
      return [{ ...candidate, allowedConnectionIds }];
    }
    if (candidate.connectionId) {
      if (!isConnectionEligibleForModel(
        candidate.provider,
        candidate.connectionId,
        candidate.model,
        connectionsById
      )) {
        changed = true;
        return [];
      }
    }
    return [candidate];
  });
  return changed ? filtered : pool;
}
export {
  SYNTHETIC_NOAUTH_CONNECTION_ID,
  filterResilienceBlockedCandidates
};
