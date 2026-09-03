// ADAPTED — graceful fallback (was @/lib/guardrails).
// Post-call guardrail hooks: no guardrails registered, nothing disabled.
export function resolveDisabledGuardrails() {
  return [];
}
export const guardrailRegistry = {
  runPostCallHooks: async () => [],
};
export function runPostCallGuardrails() {
  return undefined;
}