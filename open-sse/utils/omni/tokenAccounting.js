// ADAPTED — graceful fallback (was @/lib/usage/tokenAccounting).
function asRecord(usage) {
  return usage && typeof usage === "object" && !Array.isArray(usage) ? usage : {};
}

export function getLoggedInputTokens(tokens) {
  const u = asRecord(tokens);
  const v = u.input_tokens ?? u.prompt_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getLoggedOutputTokens(tokens) {
  const u = asRecord(tokens);
  const v = u.output_tokens ?? u.completion_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getReasoningTokens(tokens) {
  const u = asRecord(tokens);
  const v = u.reasoning_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getPromptCacheReadTokens(tokens) {
  const u = asRecord(tokens);
  const v = u.prompt_tokens_details?.cached_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getPromptCacheCreationTokens(tokens) {
  const u = asRecord(tokens);
  const v = u.prompt_tokens_details?.cache_creation_input_tokens;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function formatUsageLog(tokens) {
  const input = getLoggedInputTokens(tokens);
  const output = getLoggedOutputTokens(tokens);
  const reasoning = getReasoningTokens(tokens);
  const parts = [`in=${input}`, `out=${output}`];
  if (reasoning > 0) parts.push(`reasoning=${reasoning}`);
  return parts.join(" ");
}