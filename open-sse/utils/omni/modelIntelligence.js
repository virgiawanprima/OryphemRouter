// ADAPTED STUB — OmniRoute `src/lib/db/modelIntelligence.ts`. OryphemRouter has no
// model-intelligence DB; no overrides (lookups return null) and override writes
// are no-ops (graceful — task fitness falls back to the static table).
export function getModelIntelligenceBySource() {
  return null;
}
export function setUserFitnessOverrideEntry() {}
export function deleteUserFitnessOverrideEntry() {}
export default { getModelIntelligenceBySource, setUserFitnessOverrideEntry, deleteUserFitnessOverrideEntry };
