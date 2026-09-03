import {
  CODEX_CLI_RS_ORIGINATOR,
  DEFAULT_CODEX_CLIENT_VERSION,
  getCodexCliRsHeaders as buildCodexCliRsHeaders
} from "../utils/omni/codexClient.js";
import {
  DEFAULT_CODEX_CLIENT_VERSION as DEFAULT_CODEX_CLIENT_VERSION2,
  CODEX_CLI_RS_ORIGINATOR as CODEX_CLI_RS_ORIGINATOR2
} from "../utils/omni/codexClient.js";
const DEFAULT_CODEX_USER_AGENT_PLATFORM = "Windows 10.0.26200";
const DEFAULT_CODEX_USER_AGENT_ARCH = "x64";
const CODEX_VERSION_OVERRIDE_ENV = "CODEX_CLIENT_VERSION";
const CODEX_USER_AGENT_OVERRIDE_ENV = "CODEX_USER_AGENT";
const SAFE_HEADER_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const SAFE_HEADER_VALUE_PATTERN = /^[\x20-\x7E]{1,200}$/;
const SAFE_CODEX_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
function getSafeEnvValue(name, pattern) {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (!normalized || !pattern.test(normalized)) {
    return null;
  }
  return normalized;
}
function getCodexClientVersion() {
  return getSafeEnvValue(CODEX_VERSION_OVERRIDE_ENV, SAFE_HEADER_TOKEN_PATTERN) || DEFAULT_CODEX_CLIENT_VERSION;
}
function getCodexUserAgent() {
  const override = getSafeEnvValue(CODEX_USER_AGENT_OVERRIDE_ENV, SAFE_HEADER_VALUE_PATTERN);
  if (override) {
    return override;
  }
  return `codex-cli/${getCodexClientVersion()} (${DEFAULT_CODEX_USER_AGENT_PLATFORM}; ${DEFAULT_CODEX_USER_AGENT_ARCH})`;
}
function getCodexDefaultHeaders() {
  return {
    Version: getCodexClientVersion(),
    "Openai-Beta": "responses=experimental",
    "X-Codex-Beta-Features": "responses_websockets",
    "User-Agent": getCodexUserAgent()
  };
}
function getCodexCliRsHeaders() {
  return buildCodexCliRsHeaders(getCodexClientVersion());
}
function getCodexAuthIdentityHeaders() {
  return {
    "User-Agent": getCodexUserAgent(),
    originator: CODEX_CLI_RS_ORIGINATOR
  };
}
function getCodexBackendIdentityHeaders() {
  return {
    "User-Agent": getCodexUserAgent(),
    originator: CODEX_CLI_RS_ORIGINATOR,
    Version: getCodexClientVersion()
  };
}
function normalizeCodexSessionId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return SAFE_CODEX_SESSION_ID_PATTERN.test(normalized) ? normalized : null;
}
export {
  CODEX_CLI_RS_ORIGINATOR2 as CODEX_CLI_RS_ORIGINATOR,
  DEFAULT_CODEX_CLIENT_VERSION2 as DEFAULT_CODEX_CLIENT_VERSION,
  getCodexAuthIdentityHeaders,
  getCodexBackendIdentityHeaders,
  getCodexCliRsHeaders,
  getCodexClientVersion,
  getCodexDefaultHeaders,
  getCodexUserAgent,
  normalizeCodexSessionId
};
