import {
  isCredentialHealthy,
  isCredentialStale
} from "../utils/omni/credentialHealthCache.js";
function checkCredentialGate(connectionId, provider, modelStr) {
  const healthy = isCredentialHealthy(connectionId);
  if (healthy === false) {
    return {
      allowed: false,
      reason: `Credential gate: ${modelStr} \u2014 connection ${connectionId} has known-bad credentials (skipping)`
    };
  }
  if (healthy === true) {
    return { allowed: true };
  }
  const stale = isCredentialStale(connectionId);
  if (stale) {
    return {
      allowed: void 0,
      reason: `Credential gate: ${modelStr} \u2014 connection ${connectionId} has stale credentials (allowing, but untested for >10m)`
    };
  }
  return { allowed: void 0 };
}
function logCredentialSkip(log, modelStr, reason) {
  if (log?.info) {
    log.info("CREDENTIAL_GATE", reason);
  }
}
import { getCredentialHealthSummary as getCredentialHealthSummary2 } from "../utils/omni/credentialHealthCache.js";
export {
  checkCredentialGate,
  getCredentialHealthSummary2 as getCredentialHealthSummary,
  logCredentialSkip
};
