// ADAPTED (from OmniRoute config/codexClient.ts). Only the two functions imageGeneration
// needs; kept separate from the existing utils/omni/codexClient.js (another port).
const DEFAULT_CODEX_CLIENT_VERSION = "0.149.0";
const DEFAULT_CODEX_USER_AGENT_PLATFORM = "Windows 10.0.26200";
const DEFAULT_CODEX_USER_AGENT_ARCH = "x64";
const SAFE_HEADER_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const SAFE_HEADER_VALUE_PATTERN = /^[\x20-\x7E]{1,200}$/;
function getSafeEnvValue(name, pattern) {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  if (!normalized || !pattern.test(normalized)) return null;
  return normalized;
}
export function getCodexClientVersion() {
  return getSafeEnvValue("CODEX_CLIENT_VERSION", SAFE_HEADER_TOKEN_PATTERN) || DEFAULT_CODEX_CLIENT_VERSION;
}
export function getCodexUserAgent() {
  const override = getSafeEnvValue("CODEX_USER_AGENT", SAFE_HEADER_VALUE_PATTERN);
  if (override) return override;
  return `codex-cli/${getCodexClientVersion()} (${DEFAULT_CODEX_USER_AGENT_PLATFORM}; ${DEFAULT_CODEX_USER_AGENT_ARCH})`;
}
export function getCodexDefaultHeaders() {
  return {
    Version: getCodexClientVersion(),
    "Openai-Beta": "responses=experimental",
    "X-Codex-Beta-Features": "responses_websockets",
    "User-Agent": getCodexUserAgent(),
  };
}
