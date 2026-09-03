/**
 * ADAPTED STUB — OmniRoute's @/lib/compliance (logAuditEvent) + @/lib/compliance/providerAudit
 * (extractProviderWarnings) are app infra not present in OryphemRouter. No-op.
 */
export function logAuditEvent() { return undefined; }
export function extractProviderWarnings() { return []; }
export default { logAuditEvent, extractProviderWarnings };
