// ADAPTED STUB — OmniRoute `src/lib/db/combos.ts` reads combo definitions from
// the operator database. OryphemRouter manages combos in-memory via
// services/combo.js; this graceful fallback reports no DB combos so the combo
// image/speech/video strategies fail cleanly ("Combo not found") rather than
// crash.
export async function getComboByName(_name) {
  return null;
}

export async function getCombos() {
  return [];
}
