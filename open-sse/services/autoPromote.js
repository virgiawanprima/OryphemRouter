// autoPromote — "auto-promote successful combo model" feature (OmniRoute port).
//
// When the comboAutoPromoteEnabled setting is on and a combo model responds
// successfully, the winning model is moved to position #1 of the persisted
// combo so future requests try it first.
//
// OryphemRouter stores combo.models as plain model strings (unlike OmniRoute's
// ComboStep objects), so the helpers below treat each entry as a string id.
// Pure: never mutates the input.

/** Extract the model id from a combo step entry (string or object). */
export function comboStepModelId(step) {
  if (typeof step === "string") return step.trim().length > 0 ? step : null;
  if (step && typeof step === "object") {
    const model = step.model;
    if (typeof model === "string" && model.trim().length > 0) return model;
  }
  return null;
}

/**
 * Return a reordered copy of `models` with the entry matching `winningModel`
 * moved to the front, or `null` when no reordering is needed/possible.
 */
export function promoteModelToFront(models, winningModel) {
  if (!Array.isArray(models) || models.length === 0) return null;
  if (typeof winningModel !== "string" || winningModel.length === 0) return null;
  const matchIndex = models.findIndex((step) => comboStepModelId(step) === winningModel);
  if (matchIndex <= 0) return null;
  const winner = models[matchIndex];
  const rest = models.filter((_, index) => index !== matchIndex);
  return [winner, ...rest];
}

/**
 * Persist the auto-promotion of a successful combo model to position #1.
 * Opt-in via comboAutoPromoteEnabled. Best-effort: a DB failure is logged and
 * swallowed so it never affects the already-successful response. No-op when the
 * flag is off, the combo has no id, or the model is already first/absent.
 * `updateCombo` is injected so this stays unit-testable without a DB.
 */
export async function promoteSuccessfulComboModel(combo, winningModel, settings, deps) {
  if (!combo || !settings || !settings.comboAutoPromoteEnabled) return false;
  const comboId = typeof combo.id === "string" ? combo.id : null;
  if (!comboId) return false;
  const reordered = promoteModelToFront(
    Array.isArray(combo.models) ? combo.models : null,
    winningModel
  );
  if (!reordered) return false;
  const label = typeof combo.name === "string" ? combo.name : comboId;
  try {
    await deps.updateCombo(comboId, { models: reordered });
    deps?.info?.("COMBO", `Model "${winningModel}" succeeded — promoted to #1 in combo "${label}"`);
    return true;
  } catch (dbErr) {
    deps?.warn?.(
      "COMBO",
      `Failed to promote model "${winningModel}" in combo "${label}": ${dbErr?.message || "unknown error"}`
    );
    return false;
  }
}
