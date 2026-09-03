const KIRO_EXTERNAL_IDP_AUTH_METHOD = "external_idp";
const KIRO_EXTERNAL_IDP_TOKEN_TYPE_HEADER = "TokenType";
const KIRO_EXTERNAL_IDP_TOKEN_TYPE_VALUE = "EXTERNAL_IDP";
const ALLOWED_IDP_HOST_SUFFIXES = [
  "login.microsoftonline.com",
  "login.microsoftonline.us",
  "login.partner.microsoftonline.cn",
  "login.microsoft.com",
  "login.windows.net",
  "sts.windows.net",
  ".okta.com",
  ".oktapreview.com",
  ".okta-emea.com",
  ".auth0.com",
  ".onelogin.com",
  ".pingidentity.com",
  ".pingone.com",
  "accounts.google.com",
  "oauth2.googleapis.com",
  ".amazoncognito.com"
];
function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function isExternalIdpAuthMethod(authMethod) {
  return normalizeString(authMethod).toLowerCase() === KIRO_EXTERNAL_IDP_AUTH_METHOD;
}
function validateExternalIdpTokenEndpoint(rawEndpoint) {
  const tokenEndpoint = normalizeString(rawEndpoint);
  if (!tokenEndpoint) throw new Error("tokenEndpoint is required for external_idp");
  let parsed;
  try {
    parsed = new URL(tokenEndpoint);
  } catch {
    throw new Error("tokenEndpoint must be a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("tokenEndpoint must use https");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_IDP_HOST_SUFFIXES.some(
    (suffix) => suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix
  );
  if (!allowed) {
    throw new Error(`tokenEndpoint host is not an allowed identity provider: ${host}`);
  }
  return parsed.toString();
}
function normalizeScope(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map(normalizeString).filter(Boolean).join(" ");
  }
  return normalizeString(scopes);
}
function decodeJwtPayload(jwt) {
  try {
    if (typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - base64.length % 4) % 4;
    const json = Buffer.from(`${base64}${"=".repeat(padding)}`, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function emailFromExternalIdpToken(accessToken) {
  const claims = decodeJwtPayload(accessToken);
  if (!claims) return null;
  const pick = (k) => typeof claims[k] === "string" ? claims[k] : void 0;
  return pick("email") || pick("preferred_username") || pick("upn") || null;
}
function buildExternalIdpRefreshParams(refreshToken, providerSpecificData) {
  const psd = providerSpecificData || {};
  const clientId = normalizeString(psd.clientId ?? psd.client_id);
  const tokenEndpoint = validateExternalIdpTokenEndpoint(
    psd.tokenEndpoint ?? psd.token_endpoint
  );
  const scope = normalizeScope(psd.scope ?? psd.scopes);
  if (!refreshToken) throw new Error("refresh token is required for external_idp refresh");
  if (!clientId) throw new Error("clientId is required for external_idp refresh");
  if (!scope) throw new Error("scope is required for external_idp refresh");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    scope
  });
  return { tokenEndpoint, body };
}
export {
  KIRO_EXTERNAL_IDP_AUTH_METHOD,
  KIRO_EXTERNAL_IDP_TOKEN_TYPE_HEADER,
  KIRO_EXTERNAL_IDP_TOKEN_TYPE_VALUE,
  buildExternalIdpRefreshParams,
  decodeJwtPayload,
  emailFromExternalIdpToken,
  isExternalIdpAuthMethod,
  normalizeScope,
  validateExternalIdpTokenEndpoint
};
