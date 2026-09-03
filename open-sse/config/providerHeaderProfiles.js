import { getAntigravityContentHeaders } from "../services/antigravityHeaders.js";
const GITHUB_COPILOT_API_VERSION = "2026-08-01";
const GITHUB_COPILOT_CLI_VERSION = "1.0.81-6";
const GITHUB_COPILOT_EDITOR_VERSION = `copilot/${GITHUB_COPILOT_CLI_VERSION}`;
const GITHUB_COPILOT_CHAT_PLUGIN_VERSION = `copilot-chat/${GITHUB_COPILOT_CLI_VERSION}`;
const GITHUB_COPILOT_CHAT_USER_AGENT = `GitHubCopilotChat/${GITHUB_COPILOT_CLI_VERSION}`;
const GITHUB_COPILOT_CLI_USER_AGENT = `copilot/${GITHUB_COPILOT_CLI_VERSION}`;
const GITHUB_COPILOT_REFRESH_PLUGIN_VERSION = `copilot/${GITHUB_COPILOT_CLI_VERSION}`;
const GITHUB_COPILOT_REFRESH_USER_AGENT = "GithubCopilot/1.0";
const GITHUB_COPILOT_INTEGRATION_ID = "copilot-developer-cli";
const GITHUB_COPILOT_OPENAI_INTENT = "conversation-agent";
const GITHUB_COPILOT_INTERACTION_TYPE = "conversation-user";
const GITHUB_COPILOT_HARNESS_ID = "copilot-sdk";
const GITHUB_COPILOT_DEFAULT_INITIATOR = "user";
let _copilotMachineId = null;
function getGitHubCopilotMachineId() {
  const override = (process?.env?.GITHUB_COPILOT_MACHINE_ID || "").trim();
  if (override) return override;
  if (_copilotMachineId) return _copilotMachineId;
  _copilotMachineId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return _copilotMachineId;
}
const QWEN_CLI_VERSION = "0.19.3";
const QWEN_STAINLESS_LANG = "js";
const QODER_DEFAULT_USER_AGENT = "Qoder-Cli";
const KIRO_SDK_USER_AGENT = "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0";
const KIRO_AMZ_USER_AGENT = "aws-sdk-js/3.0.0 kiro-ide/1.0.0";
const KIRO_STREAMING_TARGET = "AmazonCodeWhispererStreamingService.GenerateAssistantResponse";
const CURSOR_REGISTRY_VERSION = "3.9";
function getGitHubCopilotChatHeaders(accept = "application/json", initiator = GITHUB_COPILOT_DEFAULT_INITIATOR, options = {}) {
  const headers = {
    "copilot-integration-id": GITHUB_COPILOT_INTEGRATION_ID,
    "editor-version": GITHUB_COPILOT_EDITOR_VERSION,
    "user-agent": GITHUB_COPILOT_CLI_USER_AGENT,
    "openai-intent": options.intent || GITHUB_COPILOT_OPENAI_INTENT,
    "x-interaction-type": GITHUB_COPILOT_INTERACTION_TYPE,
    "copilot-harness-id": GITHUB_COPILOT_HARNESS_ID,
    "x-github-api-version": GITHUB_COPILOT_API_VERSION,
    "x-client-machine-id": getGitHubCopilotMachineId(),
    "X-Initiator": initiator,
    Accept: accept,
    "Content-Type": "application/json"
  };
  if (options.vision) {
    headers["copilot-vision-request"] = "true";
  }
  return headers;
}
function getRuntimePlatform() {
  return typeof process !== "undefined" && typeof process.platform === "string" ? process.platform : "unknown";
}
function getRuntimeArch() {
  return typeof process !== "undefined" && typeof process.arch === "string" ? process.arch : "unknown";
}
function getRuntimeVersion() {
  return typeof process !== "undefined" && typeof process.version === "string" ? process.version : "unknown";
}
function normalizeStainlessPlatform(platform = getRuntimePlatform()) {
  const normalized = platform.toLowerCase();
  if (normalized.includes("ios")) return "iOS";
  if (normalized === "android") return "Android";
  if (normalized === "darwin") return "MacOS";
  if (normalized === "win32") return "Windows";
  if (normalized === "freebsd") return "FreeBSD";
  if (normalized === "openbsd") return "OpenBSD";
  if (normalized === "linux") return "Linux";
  return normalized ? `Other:${normalized}` : "Unknown";
}
function normalizeStainlessArch(arch = getRuntimeArch()) {
  if (arch === "x32") return "x32";
  if (arch === "x86_64" || arch === "x64") return "x64";
  if (arch === "arm") return "arm";
  if (arch === "aarch64" || arch === "arm64") return "arm64";
  return arch ? `other:${arch}` : "unknown";
}
function getQwenCliUserAgent(version = QWEN_CLI_VERSION) {
  return `QwenCode/${version} (${getRuntimePlatform()}; ${getRuntimeArch()})`;
}
function getGitHubCopilotInternalUserHeaders(authorization) {
  return {
    Authorization: authorization,
    Accept: "application/json",
    "X-GitHub-Api-Version": GITHUB_COPILOT_API_VERSION,
    "User-Agent": GITHUB_COPILOT_CHAT_USER_AGENT,
    "Editor-Version": GITHUB_COPILOT_EDITOR_VERSION,
    "Editor-Plugin-Version": GITHUB_COPILOT_CHAT_PLUGIN_VERSION
  };
}
function getGitHubCopilotRefreshHeaders(authorization) {
  return {
    Authorization: authorization,
    Accept: "application/json",
    "User-Agent": GITHUB_COPILOT_REFRESH_USER_AGENT,
    "Editor-Version": GITHUB_COPILOT_EDITOR_VERSION,
    "Editor-Plugin-Version": GITHUB_COPILOT_REFRESH_PLUGIN_VERSION
  };
}
function getQoderDefaultHeaders() {
  return {
    "User-Agent": QODER_DEFAULT_USER_AGENT
  };
}
function getQoderDashscopeCompatHeaders() {
  const userAgent = getQwenCliUserAgent();
  return {
    "x-dashscope-authtype": "qwen-oauth",
    "x-dashscope-cachecontrol": "enable",
    "user-agent": userAgent,
    "x-dashscope-useragent": userAgent,
    "x-stainless-arch": normalizeStainlessArch(),
    "x-stainless-lang": QWEN_STAINLESS_LANG,
    "x-stainless-os": normalizeStainlessPlatform()
  };
}
function getAntigravityUserAgent(profile = "ide") {
  return getAntigravityContentHeaders(profile)["User-Agent"];
}
function getAntigravityProviderHeaders(profile = "ide") {
  return getAntigravityContentHeaders(profile);
}
function getKiroServiceHeaders(accept = "application/vnd.amazon.eventstream") {
  return {
    "Content-Type": "application/json",
    Accept: accept,
    "X-Amz-Target": KIRO_STREAMING_TARGET,
    "User-Agent": KIRO_SDK_USER_AGENT,
    "X-Amz-User-Agent": KIRO_AMZ_USER_AGENT
  };
}
function getCursorUserAgent(version) {
  return `Cursor/${version}`;
}
function getCursorRegistryHeaders(version = CURSOR_REGISTRY_VERSION) {
  return {
    "connect-accept-encoding": "gzip",
    "connect-protocol-version": "1",
    "Content-Type": "application/connect+proto",
    "User-Agent": getCursorUserAgent(version)
  };
}
export {
  CURSOR_REGISTRY_VERSION,
  GITHUB_COPILOT_API_VERSION,
  GITHUB_COPILOT_CHAT_PLUGIN_VERSION,
  GITHUB_COPILOT_CHAT_USER_AGENT,
  GITHUB_COPILOT_CLI_USER_AGENT,
  GITHUB_COPILOT_CLI_VERSION,
  GITHUB_COPILOT_DEFAULT_INITIATOR,
  GITHUB_COPILOT_EDITOR_VERSION,
  GITHUB_COPILOT_HARNESS_ID,
  GITHUB_COPILOT_INTEGRATION_ID,
  GITHUB_COPILOT_INTERACTION_TYPE,
  GITHUB_COPILOT_OPENAI_INTENT,
  GITHUB_COPILOT_REFRESH_PLUGIN_VERSION,
  GITHUB_COPILOT_REFRESH_USER_AGENT,
  KIRO_AMZ_USER_AGENT,
  KIRO_SDK_USER_AGENT,
  KIRO_STREAMING_TARGET,
  QODER_DEFAULT_USER_AGENT,
  QWEN_CLI_VERSION,
  QWEN_STAINLESS_LANG,
  getAntigravityProviderHeaders,
  getAntigravityUserAgent,
  getCursorRegistryHeaders,
  getCursorUserAgent,
  getGitHubCopilotChatHeaders,
  getGitHubCopilotInternalUserHeaders,
  getGitHubCopilotMachineId,
  getGitHubCopilotRefreshHeaders,
  getKiroServiceHeaders,
  getQoderDashscopeCompatHeaders,
  getQoderDefaultHeaders,
  getQwenCliUserAgent,
  getRuntimeArch,
  getRuntimePlatform,
  getRuntimeVersion,
  normalizeStainlessArch,
  normalizeStainlessPlatform
};
