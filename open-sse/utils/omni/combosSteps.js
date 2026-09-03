// ADAPTED STUB — deep app infra (OmniRoute src/lib/combos/steps.ts).
export function getComboModelProvider(model, _body, _credentials) {
  const idx = String(model || "").indexOf("/");
  return idx > 0 ? model.slice(0, idx) : model || null;
}
export function getComboModelString(model, _body, _credentials) {
  return model || null;
}
export function getComboStepTarget(_comboId, _step) {
  return null;
}
