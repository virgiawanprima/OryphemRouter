// ADAPTED — graceful fallback (was open-sse/services/payloadRules.ts).
// Payload-rule engine depends on wildcardRouter + fs config infra not ported.
// No rules are applied; the payload passes through unchanged.
export function resolvePayloadRuleProtocols() {
  return [];
}
export async function applyConfiguredPayloadRules(payload) {
  return { payload, applied: [] };
}
export function normalizePayloadRulesConfig() {
  return { rules: [], modelSpecs: [] };
}