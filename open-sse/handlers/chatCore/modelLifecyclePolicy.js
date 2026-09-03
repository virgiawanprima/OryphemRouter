import { HTTP_STATUS } from "../../config/constants.js";
import {
  formatModelLifecycleMessage,
  getModelLifecycleDecision
} from "../../utils/omni/modelLifecycle.js";
import { resolveModelAlias } from "../../utils/omni/modelDeprecation.js";
import { createErrorResult } from "../../utils/omni/errorExtras.js";
function getModelLifecycleError({
  provider,
  model,
  log,
  warnOnDeprecation = false
}) {
  const decision = getModelLifecycleDecision(provider, model);
  const message = formatModelLifecycleMessage(decision);
  if (message && (decision.action === "reject" || warnOnDeprecation)) {
    log?.warn?.("MODEL_LIFECYCLE", message);
  }
  if (decision.action !== "reject" || !message) return null;
  return createErrorResult(
    HTTP_STATUS.GONE,
    message,
    null,
    "model_shutdown",
    "invalid_request_error"
  );
}
function checkLifecycle(provider, model, log) {
  return getModelLifecycleError({
    provider,
    model: resolveModelAlias(model),
    log
  });
}
function resolveLifecycle(provider, model, log) {
  const resolvedModel = resolveModelAlias(model);
  if (resolvedModel !== model) {
    log?.info?.("ALIAS", `Model alias applied: ${model} \u2192 ${resolvedModel}`);
  }
  const lifecycleError = getModelLifecycleError({
    provider,
    model: resolvedModel,
    log,
    warnOnDeprecation: true
  });
  return [resolvedModel, resolvedModel === model ? model : resolvedModel, lifecycleError];
}
export {
  checkLifecycle,
  resolveLifecycle
};
