// ADAPTED STUB — OmniRoute `@/lib/db/models` auto-combo surface
// (getSyncedAvailableModelsByConnection + getCustomModels). OryphemRouter has no
// per-connection synced-model DB; graceful fallbacks: no synced models, no custom
// models (the virtual factory then falls back to the static provider-registry
// model list).
export async function getSyncedAvailableModelsByConnection() {
  return {};
}
export async function getCustomModels() {
  return [];
}
export default { getSyncedAvailableModelsByConnection, getCustomModels };
