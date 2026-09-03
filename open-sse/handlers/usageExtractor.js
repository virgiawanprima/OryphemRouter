function extractUsageFromResponse(responseBody, provider) {
  if (!responseBody || typeof responseBody !== "object") return null;
  const providerId = typeof provider === "string" ? provider.toLowerCase() : "";
  const isClaudeProvider = providerId === "claude" || providerId === "anthropic" || providerId.startsWith("anthropic-compatible");
  if (responseBody.usage && typeof responseBody.usage === "object" && responseBody.usage.prompt_tokens !== void 0) {
    return {
      prompt_tokens: responseBody.usage.prompt_tokens || 0,
      completion_tokens: responseBody.usage.completion_tokens || 0,
      // DeepSeek native API uses flat prompt_cache_hit_tokens (NOT
      // prompt_tokens_details.cached_tokens). Fall back to it so V4 cache
      // gets surfaced into kanban call_logs alongside the OpenAI/Claude paths.
      cached_tokens: responseBody.usage.prompt_tokens_details?.cached_tokens ?? responseBody.usage.input_tokens_details?.cached_tokens ?? responseBody.usage.prompt_cache_hit_tokens ?? responseBody.usage.cached_tokens ?? responseBody.usage.cache_read_input_tokens,
      reasoning_tokens: responseBody.usage.completion_tokens_details?.reasoning_tokens ?? responseBody.usage.output_tokens_details?.reasoning_tokens ?? responseBody.usage.reasoning_tokens,
      // xAI's exact provider-reported cost (port of decolua/9router#2453, capability A —
      // @ryanngit). Only set the key when present so non-xAI OpenAI-shaped usage
      // (Codex, DeepSeek, etc.) is unaffected. Ticks → USD conversion happens in
      // costCalculator.ts, not here.
      ...typeof responseBody.usage.cost_in_usd_ticks === "number" && Number.isFinite(responseBody.usage.cost_in_usd_ticks) && responseBody.usage.cost_in_usd_ticks >= 0 ? { cost_in_usd_ticks: responseBody.usage.cost_in_usd_ticks } : {}
    };
  }
  if (isClaudeProvider && responseBody.usage && typeof responseBody.usage === "object" && (responseBody.usage.input_tokens !== void 0 || responseBody.usage.output_tokens !== void 0)) {
    const inputTokens = responseBody.usage.input_tokens || 0;
    const cacheRead = responseBody.usage.cache_read_input_tokens || 0;
    const cacheCreation = responseBody.usage.cache_creation_input_tokens || 0;
    const promptTokens = inputTokens + cacheRead + cacheCreation;
    return {
      prompt_tokens: promptTokens,
      completion_tokens: responseBody.usage.output_tokens || 0,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheCreation,
      ...typeof responseBody.usage.output_tokens_details?.thinking_tokens === "number" ? { reasoning_tokens: responseBody.usage.output_tokens_details.thinking_tokens } : {}
    };
  }
  const responsesUsage = responseBody.response?.usage || responseBody.usage;
  if (responsesUsage && typeof responsesUsage === "object" && (responsesUsage.input_tokens !== void 0 || responsesUsage.output_tokens !== void 0)) {
    return {
      prompt_tokens: responsesUsage.input_tokens || 0,
      completion_tokens: responsesUsage.output_tokens || 0,
      cache_read_input_tokens: responsesUsage.cache_read_input_tokens,
      cached_tokens: responsesUsage.input_tokens_details?.cached_tokens ?? responsesUsage.prompt_tokens_details?.cached_tokens ?? responsesUsage.cache_read_input_tokens,
      cache_creation_input_tokens: responsesUsage.cache_creation_input_tokens,
      reasoning_tokens: responsesUsage.output_tokens_details?.reasoning_tokens ?? responsesUsage.completion_tokens_details?.reasoning_tokens ?? responsesUsage.reasoning_tokens
    };
  }
  const usageMetadata = responseBody.usageMetadata || responseBody.response?.usageMetadata;
  if (usageMetadata && typeof usageMetadata === "object") {
    const thoughts = usageMetadata.thoughtsTokenCount || 0;
    return {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: (usageMetadata.candidatesTokenCount || 0) + thoughts,
      cached_tokens: usageMetadata.cachedContentTokenCount || 0,
      reasoning_tokens: thoughts
    };
  }
  return null;
}
export {
  extractUsageFromResponse
};
