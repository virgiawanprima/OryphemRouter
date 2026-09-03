// ADAPTED — graceful fallback (was @/lib/providers/claudeExtraUsage).
export const CLAUDE_EXTRA_USAGE_ERROR_SOURCE = "extra_usage";
export function isClaudeExtraUsageBlockEnabled(_provider, _providerSpecificData) {
  return false;
}
export function isClaudeExtraUsageQueued() {
  return false;
}
export function isClaudeExtraUsageState() {
  return false;
}
export function resolveClaudeExtraUsageResetAt() {
  return null;
}