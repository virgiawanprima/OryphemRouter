import { getRuntimeArch, getRuntimePlatform } from "./providerHeaderProfiles.js";
const GROK_BUILD_PROXY_BASE_URL = "https://cli-chat-proxy.grok.com/v1";
const GROK_BUILD_RESPONSES_URL = `${GROK_BUILD_PROXY_BASE_URL}/responses`;
const GROK_BUILD_MODELS_URL = `${GROK_BUILD_PROXY_BASE_URL}/models`;
const GROK_BUILD_OAUTH_ISSUER = "https://auth.x.ai";
const GROK_BUILD_DEVICE_CODE_URL = `${GROK_BUILD_OAUTH_ISSUER}/oauth2/device/code`;
const GROK_BUILD_TOKEN_URL = `${GROK_BUILD_OAUTH_ISSUER}/oauth2/token`;
const GROK_BUILD_DEFAULT_CLIENT_VERSION = "0.2.106";
const GROK_BUILD_DEFAULT_CONTEXT_WINDOW = 256e3;
const GROK_BUILD_DEFAULT_REASONING_EFFORT = "high";
const GROK_BUILD_SUPPORTED_REASONING_EFFORTS = Object.freeze(["low", "medium", "high"]);
const GROK_BUILD_CLIENT_IDENTIFIER = "grok-shell";
const GROK_BUILD_TOKEN_AUTH = "xai-grok-cli";
const GROK_BUILD_REASONING_INCLUDE = "reasoning.encrypted_content";
const GROK_BUILD_OAUTH_REFERRER = "grok-build";
const GROK_BUILD_OAUTH_SCOPES = Object.freeze([
  "openid",
  "profile",
  "email",
  "offline_access",
  "grok-cli:access",
  "api:access",
  "conversations:read",
  "conversations:write",
  "workspaces:read",
  "workspaces:write"
]);
function getWireEmail(email, principalType) {
  const normalizedPrincipalType = principalType?.trim().toLowerCase();
  return normalizedPrincipalType === "team" || normalizedPrincipalType === "organization" ? null : email || null;
}
function mapPlatform(platform) {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return platform;
}
function mapArch(arch) {
  if (arch === "arm64") return "aarch64";
  if (arch === "x64") return "x86_64";
  return arch;
}
function getGrokBuildClientVersion() {
  return GROK_BUILD_DEFAULT_CLIENT_VERSION;
}
function getGrokBuildUserAgent() {
  return `${GROK_BUILD_CLIENT_IDENTIFIER}/${getGrokBuildClientVersion()} (${mapPlatform(
    getRuntimePlatform()
  )}; ${mapArch(getRuntimeArch())})`;
}
function getGrokBuildClientHeaders(clientMode = "headless") {
  return {
    "x-grok-client-version": getGrokBuildClientVersion(),
    "x-grok-client-identifier": GROK_BUILD_CLIENT_IDENTIFIER,
    "x-grok-client-mode": clientMode,
    "User-Agent": getGrokBuildUserAgent()
  };
}
function getGrokBuildSessionHeaders({
  token,
  model,
  stream = false,
  clientMode = "headless",
  userId,
  email,
  principalType
} = {}) {
  const wireEmail = getWireEmail(email, principalType);
  return {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
    ...getGrokBuildClientHeaders(clientMode),
    "X-XAI-Token-Auth": GROK_BUILD_TOKEN_AUTH,
    "x-authenticateresponse": "authenticate-response",
    ...token ? { Authorization: `Bearer ${token}` } : {},
    ...model ? { "x-grok-model-override": model } : {},
    ...userId ? {
      "x-userid": userId,
      "x-grok-user-id": userId
    } : {},
    ...wireEmail ? { "x-email": wireEmail } : {}
  };
}
function getGrokBuildOAuthHeaders(surface = "ui") {
  return {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-grok-client-version": getGrokBuildClientVersion(),
    "x-grok-client-surface": surface
  };
}
function getGrokBuildModelsHeaders({
  token,
  userId,
  email,
  principalType
}) {
  const wireEmail = getWireEmail(email, principalType);
  return {
    Accept: "application/json",
    ...getGrokBuildClientHeaders("headless"),
    "X-XAI-Token-Auth": GROK_BUILD_TOKEN_AUTH,
    ...token ? { Authorization: `Bearer ${token}` } : {},
    ...userId ? { "x-userid": userId } : {},
    ...wireEmail ? { "x-email": wireEmail } : {}
  };
}
export {
  GROK_BUILD_CLIENT_IDENTIFIER,
  GROK_BUILD_DEFAULT_CLIENT_VERSION,
  GROK_BUILD_DEFAULT_CONTEXT_WINDOW,
  GROK_BUILD_DEFAULT_REASONING_EFFORT,
  GROK_BUILD_DEVICE_CODE_URL,
  GROK_BUILD_MODELS_URL,
  GROK_BUILD_OAUTH_ISSUER,
  GROK_BUILD_OAUTH_REFERRER,
  GROK_BUILD_OAUTH_SCOPES,
  GROK_BUILD_PROXY_BASE_URL,
  GROK_BUILD_REASONING_INCLUDE,
  GROK_BUILD_RESPONSES_URL,
  GROK_BUILD_SUPPORTED_REASONING_EFFORTS,
  GROK_BUILD_TOKEN_AUTH,
  GROK_BUILD_TOKEN_URL,
  getGrokBuildClientHeaders,
  getGrokBuildClientVersion,
  getGrokBuildModelsHeaders,
  getGrokBuildOAuthHeaders,
  getGrokBuildSessionHeaders,
  getGrokBuildUserAgent
};
