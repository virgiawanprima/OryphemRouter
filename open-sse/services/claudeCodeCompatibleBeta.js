const CLAUDE_CODE_COMPATIBLE_BASE_BETAS = [
  "claude-code-20250219",
  "interleaved-thinking-2025-05-14",
  "effort-2025-11-24"
];
const CLAUDE_CODE_COMPATIBLE_REDACT_THINKING_BETA = "redact-thinking-2026-02-12";
function resolveClaudeCodeCompatibleAnthropicBeta(options = {}) {
  const betas = [...CLAUDE_CODE_COMPATIBLE_BASE_BETAS];
  if (options.redactThinking === true) {
    betas.push(CLAUDE_CODE_COMPATIBLE_REDACT_THINKING_BETA);
  }
  return betas.join(",");
}
const CLAUDE_CODE_COMPATIBLE_ANTHROPIC_BETA = resolveClaudeCodeCompatibleAnthropicBeta();
export {
  CLAUDE_CODE_COMPATIBLE_ANTHROPIC_BETA,
  CLAUDE_CODE_COMPATIBLE_REDACT_THINKING_BETA,
  resolveClaudeCodeCompatibleAnthropicBeta
};
