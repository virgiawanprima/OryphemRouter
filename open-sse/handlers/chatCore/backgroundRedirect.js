import {
  getBackgroundDegradationConfig,
  getBackgroundTaskReason,
  getDegradedModel
} from "../../services/backgroundTaskDetector.js";
function resolveBackgroundTaskRedirect(opts) {
  const bgConfig = getBackgroundDegradationConfig();
  const backgroundReason = bgConfig.enabled ? getBackgroundTaskReason(opts.body, opts.headers ?? null) : null;
  if (!backgroundReason) return { backgroundReason: null, redirect: null };
  const degradedModel = getDegradedModel(opts.model);
  if (degradedModel === opts.model) return { backgroundReason, redirect: null };
  return { backgroundReason, redirect: { degradedModel, reason: backgroundReason } };
}
export {
  resolveBackgroundTaskRedirect
};
