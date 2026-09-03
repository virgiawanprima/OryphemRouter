import {
  FREE_MODEL_BUDGETS
} from "../../utils/omni/freeModelCatalog.js";
import { SYNTHETIC_NOAUTH_CONNECTION_ID } from "./resilienceCandidateFilter.js";
const KEYLESS_FREE_TYPES = /* @__PURE__ */ new Set(["keyless"]);
function findBudgetEntry(candidate, catalog = FREE_MODEL_BUDGETS) {
  return catalog.find((m) => m.provider === candidate.provider && m.modelId === candidate.model);
}
function isConnectionStateSafe(provider, connectionId, resolveFreeAccessState, options) {
  const state = resolveFreeAccessState(provider, connectionId);
  if (!state) return false;
  if (state.status !== "SAFE") return false;
  const now = (options.now ?? Date.now)();
  const checkedAtMs = Date.parse(state.checkedAt);
  if (!Number.isFinite(checkedAtMs) || now - checkedAtMs > options.maxStateAgeMs) return false;
  if (state.remainingFreeAllowance === null) return false;
  if (options.minRemainingAllowance < 0) return false;
  return state.remainingFreeAllowance > options.minRemainingAllowance;
}
function evaluateCandidateConnections(candidate, budgetEntry, resolveFreeAccessState, options) {
  if (!budgetEntry) return [];
  const isGenuineNoAuthCandidate = candidate.connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID;
  if (KEYLESS_FREE_TYPES.has(budgetEntry.freeType)) {
    if (isGenuineNoAuthCandidate) return [SYNTHETIC_NOAUTH_CONNECTION_ID];
  }
  if (budgetEntry.freeType === "discontinued") return [];
  if (isGenuineNoAuthCandidate) return [];
  if (budgetEntry.hardStopGuaranteed !== true) return [];
  const candidateConnectionIds = candidate.connectionId ? [candidate.connectionId] : candidate.allowedConnectionIds ?? [];
  const safe = [];
  for (const connectionId of candidateConnectionIds) {
    if (connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID) continue;
    if (isConnectionStateSafe(candidate.provider, connectionId, resolveFreeAccessState, options)) {
      safe.push(connectionId);
    }
  }
  return safe;
}
function filterStrictZeroCostCandidates(pool, options) {
  if (!options.enabled) return pool;
  const kept = [];
  let changed = false;
  for (const candidate of pool) {
    const budgetEntry = findBudgetEntry(candidate, options.catalog);
    const safeConnectionIds = evaluateCandidateConnections(
      candidate,
      budgetEntry,
      options.resolveFreeAccessState,
      options
    );
    if (safeConnectionIds.length === 0) {
      changed = true;
      continue;
    }
    const isGenuineNoAuthCandidate = candidate.connectionId === SYNTHETIC_NOAUTH_CONNECTION_ID;
    const isSingleConnectionCandidate = candidate.connectionId !== null;
    if (isGenuineNoAuthCandidate || isSingleConnectionCandidate) {
      kept.push(candidate);
      continue;
    }
    const original = candidate.allowedConnectionIds ?? [];
    const isSameSet = original.length === safeConnectionIds.length && safeConnectionIds.every((id) => original.includes(id));
    if (isSameSet) {
      kept.push(candidate);
    } else {
      changed = true;
      kept.push({ ...candidate, allowedConnectionIds: safeConnectionIds });
    }
  }
  return changed ? kept : pool;
}
function filterTosAvoidCandidates(pool, excludeTosAvoid, catalog) {
  if (!excludeTosAvoid) return pool;
  return pool.filter((candidate) => {
    const budgetEntry = findBudgetEntry(candidate, catalog);
    return budgetEntry?.tos !== "avoid";
  });
}
export {
  evaluateCandidateConnections,
  filterStrictZeroCostCandidates,
  filterTosAvoidCandidates,
  findBudgetEntry
};
