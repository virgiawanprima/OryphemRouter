import { CLAUDE_WEB_FINGERPRINT } from "../config/claudeWebFingerprint.js";
const DUCKDUCKGO_FALLBACK_FINGERPRINT = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  secChUa: '"Chromium";v="149", "Google Chrome";v="149", "Not-A.Brand";v="99"',
  secChUaPlatform: '"macOS"'
};
function resolveHttpBackedChatFingerprint(chatUrlMatchDomain) {
  return chatUrlMatchDomain === "claude.ai" ? CLAUDE_WEB_FINGERPRINT : DUCKDUCKGO_FALLBACK_FINGERPRINT;
}
export {
  resolveHttpBackedChatFingerprint
};
