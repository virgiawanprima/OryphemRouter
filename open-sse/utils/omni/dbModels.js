// ADAPTED — graceful fallback (was @/lib/db/models).
// getModelUpstreamExtraHeaders returns {}; no per-model header overrides configured.
export async function getAllCustomModels() {
  return [];
}
export function getModelUpstreamExtraHeaders() {
  return {};
}
export function getModelIsHidden() {
  return false;
}