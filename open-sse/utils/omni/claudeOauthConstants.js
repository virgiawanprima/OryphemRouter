/**
 * ADAPTED — OmniRoute's translator/request/openai-to-claude.ts exports
 * CLAUDE_OAUTH_TOOL_PREFIX; OryphemRouter's ported openai-to-claude.js does not
 * include it. Extracted constant so chatCore consumers keep compiling.
 */
export const CLAUDE_OAUTH_TOOL_PREFIX = "proxy_";
export default { CLAUDE_OAUTH_TOOL_PREFIX };
