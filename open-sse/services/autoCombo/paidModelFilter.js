import { isFreeModel, providerHasFreeModels } from "../../utils/omni/freeModels.js";
function isFreeCandidate(candidate) {
  return providerHasFreeModels(candidate.provider) && isFreeModel(candidate.provider, { id: candidate.model });
}
function filterPaidOnlyCandidates(pool, hidePaidModels) {
  if (!hidePaidModels) return pool;
  return pool.filter(isFreeCandidate);
}
export {
  filterPaidOnlyCandidates
};
