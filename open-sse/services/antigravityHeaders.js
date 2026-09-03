import {
  getCachedAntigravityCliVersion,
  getCachedAntigravityIdeVersion
} from "./antigravityVersion.js";
const ANTIGRAVITY_IDE_NODE_API_CLIENT = "google-api-nodejs-client/10.3.0";
const ANTIGRAVITY_IDE_NODE_X_GOOG_API_CLIENT = "gl-node/22.21.1";
const ANTIGRAVITY_OS_TYPE = "darwin";
const ANTIGRAVITY_ARCH = "arm64";
function withOptionalBearerAuth(headers, accessToken) {
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}
function antigravityIdeUserAgent(version = getCachedAntigravityIdeVersion()) {
  return `antigravity/ide/${version} ${ANTIGRAVITY_OS_TYPE}/${ANTIGRAVITY_ARCH}`;
}
function antigravityCliUserAgent(version = getCachedAntigravityCliVersion(), authMethod = "consumer") {
  return `antigravity/cli/${version} (aidev_client; os_type=${ANTIGRAVITY_OS_TYPE}; arch=${ANTIGRAVITY_ARCH}; auth_method=${authMethod})`;
}
function antigravityIdeNodeUserAgent(version = getCachedAntigravityIdeVersion()) {
  return `antigravity/${version} ${ANTIGRAVITY_OS_TYPE}/${ANTIGRAVITY_ARCH} ${ANTIGRAVITY_IDE_NODE_API_CLIENT}`;
}
function getAntigravityOAuthUserAgent(profile) {
  return profile === "cli" ? antigravityCliUserAgent() : antigravityIdeNodeUserAgent();
}
function getAntigravityContentHeaders(profile, accessToken) {
  return withOptionalBearerAuth(
    {
      "Content-Type": "application/json",
      "User-Agent": profile === "cli" ? antigravityCliUserAgent() : antigravityIdeUserAgent()
    },
    accessToken
  );
}
function getAntigravityIdeNodeHeaders(accessToken) {
  return withOptionalBearerAuth(
    {
      "Content-Type": "application/json",
      "User-Agent": antigravityIdeNodeUserAgent(),
      "X-Goog-Api-Client": ANTIGRAVITY_IDE_NODE_X_GOOG_API_CLIENT
    },
    accessToken
  );
}
function getAntigravityLoadCodeAssistMetadata() {
  return {
    ideType: "ANTIGRAVITY"
  };
}
export {
  ANTIGRAVITY_IDE_NODE_API_CLIENT,
  ANTIGRAVITY_IDE_NODE_X_GOOG_API_CLIENT,
  antigravityCliUserAgent,
  antigravityIdeNodeUserAgent,
  antigravityIdeUserAgent,
  getAntigravityContentHeaders,
  getAntigravityIdeNodeHeaders,
  getAntigravityLoadCodeAssistMetadata,
  getAntigravityOAuthUserAgent
};
