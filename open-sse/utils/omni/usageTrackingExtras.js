/**
 * ADAPTED — OmniRoute's utils/usageTracking.ts also exports
 * sanitizeProviderUsageForRequest(); OryphemRouter's ported usageTracking.js
 * only exposes addBufferToUsage/filterUsageForFormat/estimateUsage. This module
 * re-exports those (so callers can import everything from one place) plus a
 * faithful port of sanitizeProviderUsageForRequest with its private helpers.
 */
import { FORMATS } from "../../translator/formats.js";
export { addBufferToUsage, filterUsageForFormat, estimateUsage } from "../../utils/usageTracking.js";

const INPUT_USAGE_BYTE_MULTIPLIER = 2;
const INPUT_USAGE_FIXED_ALLOWANCE = 8192;
const REMOTE_CONTEXT_REFERENCE_KEYS = new Set([
  "previous_response_id", "previousResponseId", "conversation_id",
  "conversationId", "thread_id", "threadId", "parent_message_id", "parentMessageId",
  "cached_content", "cachedContent", "file_id", "fileId", "image_url", "imageUrl",
  "audio_url", "audioUrl", "video_url", "videoUrl",
]);

function hasValue(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function hasRemoteContextReference(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasRemoteContextReference(item, depth + 1));
  }
  for (const [key, nested] of Object.entries(value)) {
    if (REMOTE_CONTEXT_REFERENCE_KEYS.has(key) && hasValue(nested)) return true;
    if (hasRemoteContextReference(nested, depth + 1)) return true;
  }
  return false;
}

function getSerializedBodyBytes(body) {
  if (!body || typeof body !== "object" || hasRemoteContextReference(body)) return null;
  try {
    const serialized = JSON.stringify(body);
    if (!serialized) return null;
    return Buffer.byteLength(serialized, "utf8");
  } catch {
    return null;
  }
}

function tokenNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function estimateTokenCount(text) {
  if (!text || typeof text !== "string") return 0;
  const cjkMatches = text.match(/[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCJK = text.replace(/[\u3000-\u9fff\uf900-\ufaff]/g, " ");
  const tokens = nonCJK
    .split(/(\s+|[^\w\s]|(?<=[a-z])(?=[A-Z]))/)
    .filter((t) => t && t.trim().length > 0);
  return cjkCount + Math.ceil(tokens.length * 1.3);
}

function estimateInputTokens(body) {
  if (!body || typeof body !== "object") return 0;
  const record = body;
  try {
    let toolTokens = 0;
    let messageTokens = 0;
    if (record.tools && Array.isArray(record.tools)) {
      const toolStr = JSON.stringify(record.tools);
      toolTokens = Math.ceil(toolStr.length / 6);
      const { tools, ...bodyWithoutTools } = record;
      messageTokens = estimateTokenCount(JSON.stringify(bodyWithoutTools));
    } else {
      messageTokens = estimateTokenCount(JSON.stringify(record));
    }
    return messageTokens + toolTokens;
  } catch {
    return 0;
  }
}

export function isInputTokenCountPlausible(inputTokens, body) {
  if (typeof inputTokens !== "number" || !Number.isFinite(inputTokens) || inputTokens < 0) {
    return false;
  }
  const bodyBytes = getSerializedBodyBytes(body);
  if (bodyBytes === null) return true;
  const maximum = bodyBytes * INPUT_USAGE_BYTE_MULTIPLIER + INPUT_USAGE_FIXED_ALLOWANCE;
  return inputTokens <= maximum;
}

function resolveUsageFormat(usage, targetFormat) {
  if (targetFormat === FORMATS.CLAUDE) return FORMATS.CLAUDE;
  if (targetFormat === FORMATS.GEMINI || targetFormat === FORMATS.ANTIGRAVITY) return FORMATS.GEMINI;
  if (targetFormat === FORMATS.OPENAI_RESPONSES || targetFormat === FORMATS.OPENAI_RESPONSE) {
    return FORMATS.OPENAI_RESPONSES;
  }
  if (targetFormat === FORMATS.OPENAI) return FORMATS.OPENAI;
  if (usage?.promptTokenCount !== undefined || usage?.candidatesTokenCount !== undefined) return FORMATS.GEMINI;
  if (usage?.cache_read_input_tokens !== undefined || usage?.cache_creation_input_tokens !== undefined) return FORMATS.CLAUDE;
  if (usage?.input_tokens_details !== undefined) return FORMATS.OPENAI_RESPONSES;
  return FORMATS.OPENAI;
}

function getReportedInputTokens(usage, format) {
  if (format === FORMATS.CLAUDE) {
    return tokenNumber(usage.input_tokens) + tokenNumber(usage.cache_read_input_tokens) + tokenNumber(usage.cache_creation_input_tokens);
  }
  if (format === FORMATS.GEMINI) return tokenNumber(usage.promptTokenCount);
  if (format === FORMATS.OPENAI_RESPONSES) return tokenNumber(usage.input_tokens ?? usage.prompt_tokens);
  return tokenNumber(usage.prompt_tokens ?? usage.input_tokens);
}

function clearCachedTokenDetail(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...value };
  if (result.cached_tokens !== undefined) result.cached_tokens = 0;
  return result;
}

export function sanitizeProviderUsageForRequest(usage, body, targetFormat = null) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return usage;
  const format = resolveUsageFormat(usage, targetFormat);
  const reportedInput = getReportedInputTokens(usage, format);
  const bodyBytesForZeroCheck = reportedInput === 0 ? getSerializedBodyBytes(body) : null;
  const zeroIsPlausible = reportedInput === 0 && (bodyBytesForZeroCheck === null || bodyBytesForZeroCheck === 0);
  if (zeroIsPlausible || (reportedInput > 0 && isInputTokenCountPlausible(reportedInput, body))) {
    return usage;
  }
  const estimatedInput = Math.max(1, estimateInputTokens(body));
  const result = { ...usage };
  if (format === FORMATS.CLAUDE) {
    result.input_tokens = estimatedInput;
    result.cache_read_input_tokens = 0;
    result.cache_creation_input_tokens = 0;
    return result;
  }
  if (format === FORMATS.GEMINI) {
    const output = tokenNumber(result.candidatesTokenCount) + tokenNumber(result.thoughtsTokenCount);
    result.promptTokenCount = estimatedInput;
    result.cachedContentTokenCount = 0;
    if (result.totalTokenCount !== undefined) result.totalTokenCount = estimatedInput + output;
    return result;
  }
  if (format === FORMATS.OPENAI_RESPONSES) {
    result.input_tokens = estimatedInput;
    result.input_tokens_details = clearCachedTokenDetail(result.input_tokens_details);
    result.cache_read_input_tokens = 0;
    result.cache_creation_input_tokens = 0;
    if (result.total_tokens !== undefined) result.total_tokens = estimatedInput + tokenNumber(result.output_tokens);
    return result;
  }
  result.prompt_tokens = estimatedInput;
  result.cached_tokens = 0;
  result.cache_read_input_tokens = 0;
  result.cache_creation_input_tokens = 0;
  result.prompt_tokens_details = clearCachedTokenDetail(result.prompt_tokens_details);
  if (result.total_tokens !== undefined) result.total_tokens = estimatedInput + tokenNumber(result.completion_tokens);
  return result;
}
export default { sanitizeProviderUsageForRequest, isInputTokenCountPlausible };
