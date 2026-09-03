// ADAPTED STUB — OmniRoute `@/shared/utils/freeModels`. OryphemRouter has no
// free-model budget catalog; nothing is classified free (so the opt-in
// `hidePaidModels` auto-combo filter removes everything — fail-safe, and only
// active when the operator turns the setting on).
export function isFreeModel() {
  return false;
}
export function providerHasFreeModels() {
  return false;
}
export default { isFreeModel, providerHasFreeModels };
