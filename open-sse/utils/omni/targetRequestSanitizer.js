// ADAPTED — graceful fallback (was open-sse/services/targetRequestSanitizer.ts).
// OmniRoute's translator/paramSupport + executors/base/reasoningEffort infra are
// not ported; returns the body unchanged so requests pass through.
export function targetSupportsVerbosity() {
  return false;
}
export function sanitizeRequestForResolvedTarget(body) {
  return body;
}