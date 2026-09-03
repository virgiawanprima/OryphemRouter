// ADAPTED STUB — OmniRoute `open-sse/services/usage.ts` surface consumed by the
// services/autoCombo port (getUsageForProvider + USAGE_FETCHER_PROVIDERS).
//
// Re-exports OryphemRouter's NATIVE usage fetcher (services/usage.js), adapting
// the call convention: OmniRoute calls (connection, options); the native
// signature is (connection, proxyOptions, options). USAGE_FETCHER_PROVIDERS is
// the set of provider keys the native usage handler map covers.
import { getUsageForProvider as nativeGetUsageForProvider } from "../../services/usage.js";

export const USAGE_FETCHER_PROVIDERS = [
  "github",
  "gemini-cli",
  "antigravity",
  "claude",
  "codex",
  "kiro",
  "qoder",
  "iflow",
  "ollama",
  "glm",
  "glm-cn",
  "minimax",
  "minimax-cn",
  "vercel-ai-gateway",
  "codebuddy-cn",
  "codebuddy-intl",
  "grok-cli",
  "kimi",
  "deepseek",
];

export async function getUsageForProvider(connection, options) {
  return nativeGetUsageForProvider(connection, null, options);
}
export default { getUsageForProvider, USAGE_FETCHER_PROVIDERS };
