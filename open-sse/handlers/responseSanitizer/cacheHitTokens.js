function applyCacheHitTokensToUsage(usageRecord, sanitized) {
  if (usageRecord.prompt_cache_hit_tokens !== void 0 && (!sanitized.prompt_tokens_details || !sanitized.prompt_tokens_details.cached_tokens)) {
    const details = sanitized.prompt_tokens_details ?? {};
    details.cached_tokens = usageRecord.prompt_cache_hit_tokens;
    sanitized.prompt_tokens_details = details;
  }
  if (sanitized.cache_read_input_tokens !== void 0 && sanitized.cache_read_input_tokens !== 0 && (!sanitized.prompt_tokens_details || !sanitized.prompt_tokens_details.cached_tokens)) {
    const details = sanitized.prompt_tokens_details ?? {};
    details.cached_tokens = sanitized.cache_read_input_tokens;
    sanitized.prompt_tokens_details = details;
  }
}
function applyCacheHitTokensToResponsesUsage(normalized, toRecordFn) {
  if (normalized.prompt_cache_hit_tokens !== void 0 && !toRecordFn(normalized.input_tokens_details)?.cached_tokens) {
    normalized.input_tokens_details = {
      ...toRecordFn(normalized.input_tokens_details) || {},
      cached_tokens: normalized.prompt_cache_hit_tokens
    };
  }
  if (normalized.cache_read_input_tokens !== void 0 && normalized.cache_read_input_tokens !== 0 && !toRecordFn(normalized.input_tokens_details)?.cached_tokens) {
    normalized.input_tokens_details = {
      ...toRecordFn(normalized.input_tokens_details) || {},
      cached_tokens: normalized.cache_read_input_tokens
    };
  }
}
export {
  applyCacheHitTokensToResponsesUsage,
  applyCacheHitTokensToUsage
};
