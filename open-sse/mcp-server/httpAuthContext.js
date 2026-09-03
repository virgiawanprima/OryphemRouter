import { AsyncLocalStorage } from "node:async_hooks";
import { extractApiKey, isValidApiKey } from "../utils/omni/sseAuth.js";
import { getApiKeyMetadata } from "../utils/omni/dbApiKeys.js";
const mcpHttpAuthContext = new AsyncLocalStorage();
function headerValue(request, name) {
  const value = request.headers.get(name);
  return value && value.trim().length > 0 ? value : void 0;
}
function getMcpHttpAuthHeadersForInternalFetch() {
  const context = mcpHttpAuthContext.getStore();
  const headers = {};
  if (context?.authorization) headers.Authorization = context.authorization;
  if (context?.cookie) headers.Cookie = context.cookie;
  if (context?.xApiKey && context?.anthropicVersion) {
    headers["x-api-key"] = context.xApiKey;
    headers["anthropic-version"] = context.anthropicVersion;
  }
  return headers;
}
async function resolveMcpCallerAuthInfo(request) {
  const rawKey = extractApiKey(request, { allowUrl: false });
  if (!rawKey) return void 0;
  try {
    if (!await isValidApiKey(rawKey)) return void 0;
    const meta = await getApiKeyMetadata(rawKey);
    if (!meta || !meta.id) return void 0;
    return { token: rawKey, clientId: String(meta.id), scopes: meta.scopes ?? [] };
  } catch {
    return void 0;
  }
}
async function withMcpHttpAuthContext(request, callback) {
  return mcpHttpAuthContext.run(
    {
      authorization: headerValue(request, "authorization"),
      cookie: headerValue(request, "cookie"),
      xApiKey: headerValue(request, "x-api-key"),
      anthropicVersion: headerValue(request, "anthropic-version")
    },
    callback
  );
}
export {
  getMcpHttpAuthHeadersForInternalFetch,
  resolveMcpCallerAuthInfo,
  withMcpHttpAuthContext
};
