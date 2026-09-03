import { getMcpHttpAuthHeadersForInternalFetch } from "./httpAuthContext.js";
import { extractApiKey } from "../utils/omni/sseAuth.js";
import { getApiKeyMetadata } from "../utils/omni/dbApiKeys.js";
async function resolvePrincipalFromHeaders(headers, lookup = getApiKeyMetadata) {
  if (!headers.Authorization && !headers["x-api-key"]) return void 0;
  const rawKey = extractApiKey({ headers: new Headers(headers) }, { allowUrl: false });
  if (!rawKey) return void 0;
  try {
    const meta = await lookup(rawKey);
    return meta?.id != null && meta.id !== "" ? String(meta.id) : void 0;
  } catch {
    return void 0;
  }
}
async function resolveMcpCallerApiKeyId() {
  const fromHeaders = await resolvePrincipalFromHeaders(getMcpHttpAuthHeadersForInternalFetch());
  if (fromHeaders !== void 0) return fromHeaders;
  return resolvePrincipalFromEnv();
}
async function resolvePrincipalFromEnv() {
  const rawKey = process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY;
  if (!rawKey) return void 0;
  try {
    const meta = await getApiKeyMetadata(rawKey);
    return meta?.id != null && meta.id !== "" ? String(meta.id) : void 0;
  } catch {
    return void 0;
  }
}
export {
  resolveMcpCallerApiKeyId,
  resolvePrincipalFromHeaders
};
