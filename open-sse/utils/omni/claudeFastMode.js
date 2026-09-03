// ADAPTED — graceful fallback (was @/lib/providers/claudeFastMode).
export const CPA_FORCE_FAST_MODE_HEADER = "X-CPA-Force-Fast-Mode";
export const CLAUDE_FAST_MODE_DEFAULT_MODELS = [];
export function isClaudeFastModeEnabled() {
  return false;
}
export function getClaudeFastModeSupportedModels() {
  return [];
}
export function shouldRequestClaudeFastMode(_settings, _model) {
  return false;
}