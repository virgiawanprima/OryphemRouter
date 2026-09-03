// Minimal adapted port of the isClaudeCodeCompatible predicate from
// OmniRoute open-sse/services/provider.ts (deep app infra). Covers the
// "anthropic-compatible-cc-" prefix + built-ins that adopt the CC wire image.
const CLAUDE_CODE_COMPATIBLE_PREFIX = "anthropic-compatible-cc-";
const CC_WIRE_IMAGE_BUILTINS = new Set(["agentrouter"]);

function usesCcWireImage(provider) {
  return typeof provider === "string" && CC_WIRE_IMAGE_BUILTINS.has(provider);
}

export function isClaudeCodeCompatible(provider) {
  return (
    (typeof provider === "string" && provider.startsWith(CLAUDE_CODE_COMPATIBLE_PREFIX)) ||
    usesCcWireImage(provider)
  );
}
