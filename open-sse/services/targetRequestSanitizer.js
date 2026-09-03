import { stripUnsupportedParams } from "../utils/omni/paramSupport.js";
import { sanitizeReasoningEffortForProvider } from "../utils/omni/reasoningEffort.js";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function targetSupportsVerbosity(model) {
  return typeof model === "string" && /(?:^|\/)gpt-5(?:[._-]|$)/i.test(model.trim());
}
function stripVerbosityForTarget(body, model) {
  if (targetSupportsVerbosity(model)) return [];
  const stripped = [];
  if (Object.hasOwn(body, "verbosity")) {
    delete body.verbosity;
    stripped.push("verbosity");
  }
  if (isRecord(body.text) && Object.hasOwn(body.text, "verbosity")) {
    const text = { ...body.text };
    delete text.verbosity;
    if (Object.keys(text).length === 0) delete body.text;
    else body.text = text;
    stripped.push("text.verbosity");
  }
  return stripped;
}
function sanitizeRequestForResolvedTarget(body, options) {
  let next = { ...body };
  const stripped = stripVerbosityForTarget(next, options.model);
  next = sanitizeReasoningEffortForProvider(
    next,
    options.provider || "",
    options.model,
    options.log
  );
  stripUnsupportedParams(options.provider, options.model, next);
  if (stripped.length > 0) {
    options.log?.debug?.(
      "TARGET_PARAMS",
      `Stripped ${stripped.join(", ")} for resolved target ${options.provider || "unknown"}/${options.model}`
    );
  }
  return next;
}
export {
  sanitizeRequestForResolvedTarget,
  targetSupportsVerbosity
};
