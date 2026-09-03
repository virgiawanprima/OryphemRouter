import {
  CLAUDE_CODE_CLIENT_VERSION,
  CLAUDE_CODE_RUNTIME_VERSION,
  CLAUDE_CODE_SDK_PACKAGE_VERSION,
  getClaudeCodeUserAgent
} from "../utils/omni/claudeCodeClient.js";
const CLAUDE_CODE_COMPATIBLE_VERSION = CLAUDE_CODE_CLIENT_VERSION;
const CLAUDE_CODE_COMPATIBLE_USER_AGENT = getClaudeCodeUserAgent("sdk-cli");
const CLAUDE_CODE_COMPATIBLE_STAINLESS_PACKAGE_VERSION = CLAUDE_CODE_SDK_PACKAGE_VERSION;
const CLAUDE_CODE_COMPATIBLE_STAINLESS_RUNTIME_VERSION = CLAUDE_CODE_RUNTIME_VERSION;
const CONTEXT_1M_NATIVE_MODELS = ["claude-opus-5"];
function modelHasNativeContext1m(model) {
  const normalizedModel = String(model || "").trim().toLowerCase().replace(/-\d{8}$/, "");
  return CONTEXT_1M_NATIVE_MODELS.some(
    (supported) => normalizedModel === supported || normalizedModel.startsWith(`${supported}-`)
  );
}
export {
  CLAUDE_CODE_COMPATIBLE_STAINLESS_PACKAGE_VERSION,
  CLAUDE_CODE_COMPATIBLE_STAINLESS_RUNTIME_VERSION,
  CLAUDE_CODE_COMPATIBLE_USER_AGENT,
  CLAUDE_CODE_COMPATIBLE_VERSION,
  modelHasNativeContext1m
};
