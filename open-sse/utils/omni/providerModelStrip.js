// ADAPTED STUB — OmniRoute `open-sse/config/providerModels.ts` exports both
// `PROVIDER_ID_TO_ALIAS` and `getModelStripTypes`. OryphemRouter's
// config/providerModels.js exposes the equivalent `getModelStrip(alias, modelId)`
// (same semantics: returns the model's strip content-type list). This adapter
// bridges the naming for services/modelStrip.js.
export { PROVIDER_ID_TO_ALIAS } from "../../config/providerModels.js";
import { getModelStrip } from "../../config/providerModels.js";

export function getModelStripTypes(aliasOrId, modelId) {
  return getModelStrip(aliasOrId, modelId);
}

// Also needed by claudeCodeCompatible (which imports providerModels.ts).
// Minimal ports of OmniRoute's supportsClaudeMaxEffort / supportsXHighEffort.
const CLAUDE_MODEL_PATTERN = /(?:^|[\/._-])claude(?:[._-]|$)/;
const CLAUDE_MAX_EFFORT_UNSUPPORTED_FAMILY_PATTERNS = [/(?:^|[\/._-])haiku(?:[._-]|$)/];

export function supportsClaudeMaxEffort(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return false;
  const normalized = modelId.toLowerCase();
  const claudeMatch = normalized.match(CLAUDE_MODEL_PATTERN);
  if (!claudeMatch) return false;
  const claudeScopedId = normalized.slice(claudeMatch.index ?? 0);
  return !CLAUDE_MAX_EFFORT_UNSUPPORTED_FAMILY_PATTERNS.some((pattern) =>
    pattern.test(claudeScopedId)
  );
}

export function supportsXHighEffort(_aliasOrId, _modelId) {
  return true;
}

