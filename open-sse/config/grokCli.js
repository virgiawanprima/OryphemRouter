export const GROK_CLI_VERSION = "0.2.99";
// Canonical real xAI model id (was the shortened "grok-build"). The cli-chat-proxy
// still expects the short token on the wire, mapped via upstreamModelId in the registry.
export const GROK_CLI_MODEL = "grok-build-0.1";
export const GROK_CLI_BASE_URL = "https://cli-chat-proxy.grok.com/v1";
export const GROK_CLI_CLIENT_IDENTIFIER = "grok-shell";
export const GROK_CLI_USER_AGENT = `grok-shell/${GROK_CLI_VERSION} (linux; x86_64)`;

export function supportsGrokCliReasoningEffort(model) {
  // ponytail: unknown models omit effort until live metadata reaches dispatch.
  return /^grok-4\.5(?:$|-)/.test(String(model || ""));
}
