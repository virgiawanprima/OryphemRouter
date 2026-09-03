// ADAPTED STUB — OmniRoute `services/combo/comboStructure.ts` implements full
// combo target resolution (nested combos, weighted fallback, hidden models).
// OryphemRouter's services/combo.js predates this module and does not export
// `resolveComboTargets`. This minimal version flattens top-level string/model
// entries into `ResolvedComboTarget`-shaped objects (field consumed by the
// image/speech/video combo strategies: `modelStr`).
export function resolveComboTargets(combo, _allCombos) {
  const targets = [];
  const models = combo?.models;
  if (!Array.isArray(models)) return targets;
  for (const m of models) {
    if (typeof m === "string") {
      targets.push({ modelStr: m, provider: null, model: m, kind: "model" });
    } else if (m && typeof m === "object") {
      const modelStr = m.modelStr || m.model || m.id;
      if (typeof modelStr === "string") {
        targets.push({
          ...m,
          modelStr,
          provider: m.provider ?? null,
          model: m.model ?? modelStr,
          kind: "model",
        });
      }
    }
  }
  return targets;
}
