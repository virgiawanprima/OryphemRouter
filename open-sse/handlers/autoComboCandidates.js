import { buildErrorBody } from "../utils/errorSanitize.js";
import { getCircuitBreaker } from "../utils/omni/shared-circuitBreaker.js";
import { isModelLocked } from "../utils/omni/accountFallbackExtras.js";
import { getProviderConnectionById } from "../utils/omni/db-providers.js";
import { getExcludedConnectionIds } from "../utils/omni/db-autoCandidateOverrides.js";
function hasFutureRateLimit(value) {
  if (value === null || value === void 0 || value === "") return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time > Date.now();
}
async function decorateCandidate(candidate) {
  const breaker = getCircuitBreaker(candidate.provider);
  const breakerStatus = breaker.getStatus();
  const breakerReachable = breaker.canExecute();
  let connectionCooldown = false;
  if (candidate.connectionId && candidate.connectionId !== "noauth") {
    try {
      const connection = await getProviderConnectionById(candidate.connectionId);
      connectionCooldown = hasFutureRateLimit(connection?.rateLimitedUntil) || connection?.testStatus === "unavailable";
    } catch {
      connectionCooldown = false;
    }
  }
  const modelLocked = isModelLocked(candidate.provider, candidate.connectionId, candidate.model);
  return {
    provider: candidate.provider,
    connectionId: candidate.connectionId,
    model: candidate.model,
    modelStr: candidate.modelStr,
    excluded: false,
    reachable: breakerReachable && !connectionCooldown && !modelLocked,
    breakerState: String(breakerStatus.state),
    connectionCooldown,
    modelLocked
  };
}
async function getAutoComboCandidates(channel, apiKeyId) {
  const modelStr = channel === "auto" ? "auto" : `auto/${channel}`;
  let virtualCombo;
  if (channel === "auto") {
    const { createVirtualAutoCombo } = await import("../utils/omni/autoCombo-virtualFactory.js");
    virtualCombo = await createVirtualAutoCombo(void 0);
  } else {
    const { createBuiltinAutoCombo } = await import("../utils/omni/autoCombo-builtinCatalog.js");
    virtualCombo = await createBuiltinAutoCombo(modelStr, channel);
  }
  const excludedConnectionIds = apiKeyId ? await getExcludedConnectionIds(apiKeyId, modelStr).catch(() => /* @__PURE__ */ new Set()) : /* @__PURE__ */ new Set();
  const models = Array.isArray(virtualCombo?.models) ? virtualCombo.models : [];
  const accountCandidates = models.flatMap((candidate) => {
    if (candidate.connectionId) return [{ ...candidate, connectionId: candidate.connectionId }];
    return (candidate.allowedConnectionIds ?? []).map((connectionId) => ({
      ...candidate,
      connectionId
    }));
  });
  const candidates = await Promise.all(
    accountCandidates.map(async (candidate) => {
      const decorated = await decorateCandidate({
        provider: candidate.providerId,
        connectionId: candidate.connectionId,
        model: candidate.model,
        modelStr: candidate.model
      });
      return { ...decorated, excluded: excludedConnectionIds.has(candidate.connectionId) };
    })
  );
  return { channel: modelStr, candidates };
}
function isUnknownAutoChannelError(err) {
  return err instanceof Error && err.message.startsWith("Unknown built-in auto combo");
}
function buildCandidatesErrorBody(statusCode, message) {
  return buildErrorBody(statusCode, message);
}
export {
  buildCandidatesErrorBody,
  getAutoComboCandidates,
  isUnknownAutoChannelError
};
