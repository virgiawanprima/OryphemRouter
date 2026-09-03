import {
  recordKeyFailure,
  recordKeySuccess,
  recordKeyTerminal,
  trackConnectionExtraKeys
} from "../../services/apiKeyRotator.js";
import { updateProviderConnection } from "../../utils/omni/dbProviders.js";
function recordKeyHealthStatus(status, creds, log, transport) {
  if (transport === "cliproxyapi") return;
  const connId = creds?.connectionId;
  if (!connId) return;
  if (!creds?.apiKey && !creds?.accessToken) return;
  const psd = creds.providerSpecificData;
  const extraKeys = psd?.extraApiKeys ?? [];
  const health = psd?.apiKeyHealth;
  const currentKeyId = psd?.selectedKeyId ?? "primary";
  trackConnectionExtraKeys(connId, extraKeys);
  if (status === 401) {
    const updatedHealth = recordKeyFailure(connId, currentKeyId);
    log?.warn?.(
      "AUTH",
      `401 on connection ${connId.slice(0, 8)} - key marked as failed (failure #${updatedHealth.failures})`
    );
    const prevStatus = health?.[currentKeyId]?.status;
    const prevFailures = health?.[currentKeyId]?.failures ?? 0;
    if (updatedHealth.status !== prevStatus || updatedHealth.failures !== prevFailures) {
      updateProviderConnection(connId, {
        providerSpecificData: {
          ...psd,
          apiKeyHealth: { ...health, [currentKeyId]: updatedHealth }
        }
      }).catch((err) => {
        log?.error?.(
          "DB",
          `Failed to persist apiKeyHealth: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  } else if (status === 402) {
    const updatedHealth = recordKeyTerminal(connId, currentKeyId);
    log?.error?.(
      "AUTH",
      `402 on connection ${connId.slice(0, 8)} - key ${currentKeyId} marked invalid (insufficient balance)`
    );
    const prevStatus = health?.[currentKeyId]?.status;
    if (updatedHealth.status !== prevStatus) {
      updateProviderConnection(connId, {
        providerSpecificData: {
          ...psd,
          apiKeyHealth: { ...health, [currentKeyId]: updatedHealth }
        }
      }).catch((err) => {
        log?.error?.(
          "DB",
          `Failed to persist apiKeyHealth: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  } else if (status >= 200 && status < 300) {
    const updatedHealth = recordKeySuccess(connId, currentKeyId);
    const prevStatus = health?.[currentKeyId]?.status;
    if (prevStatus === "warning" || prevStatus === "invalid") {
      updateProviderConnection(connId, {
        providerSpecificData: {
          ...psd,
          apiKeyHealth: { ...health, [currentKeyId]: updatedHealth }
        }
      }).catch((err) => {
        log?.error?.(
          "DB",
          `Failed to persist apiKeyHealth: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  }
}
export {
  recordKeyHealthStatus
};
