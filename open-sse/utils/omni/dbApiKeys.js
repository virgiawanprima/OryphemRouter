// ADAPTED STUB — deep app infra (OmniRoute src/lib/db/apiKeys.ts).
// unified by integration — canonical api-key metadata facade for
// open-sse/utils/omni. getApiKeyMetadata is consumed by
// mcp-server/httpAuthContext.js and mcp-server/mcpCallerIdentity.js. (The
// separate db-apiKeys.js file serves handlers/cursorCliProxy.js and is kept
// distinct.) Returns null gracefully: OryphemRouter has no API-key metadata DB.
export async function getApiKeyMetadata(_apiKey) {
  return null;
}
