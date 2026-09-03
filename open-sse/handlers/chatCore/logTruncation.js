import {
  getChatLogTextLimit,
  getChatLogMaxDepth,
  getChatLogArrayTailItems,
  getChatLogMaxObjectKeys,
  getChatLogMaxBodyBytes
} from "../../utils/omni/lib-logEnv.js";
import { estimateSizeFast } from "../../utils/estimateSize.js";
const MEMORY_EXTRACTION_TEXT_LIMIT = 64 * 1024;
function capMemoryExtractionText(value) {
  if (value.length <= MEMORY_EXTRACTION_TEXT_LIMIT) return value;
  return value.slice(-MEMORY_EXTRACTION_TEXT_LIMIT);
}
function truncateChatLogText(value) {
  const limit = getChatLogTextLimit();
  if (value.length <= limit) return value;
  const head = value.slice(0, Math.floor(limit / 2));
  const tail = value.slice(-Math.ceil(limit / 2));
  return `${head}
[...truncated ${value.length - limit} chars...]
${tail}`;
}
function cloneBoundedChatLogPayload(value, depth = 0) {
  if (value === null || value === void 0) return value;
  if (typeof value === "string") return truncateChatLogText(value);
  if (typeof value !== "object") return value;
  if (depth >= getChatLogMaxDepth()) return "[MaxDepth]";
  const maxTailItems = getChatLogArrayTailItems();
  if (Array.isArray(value)) {
    const retained = value.length > maxTailItems ? value.slice(-maxTailItems) : value;
    const cloned = retained.map((item) => cloneBoundedChatLogPayload(item, depth + 1));
    if (value.length > maxTailItems) {
      return [
        {
          _omniroute_truncated_array: true,
          originalLength: value.length,
          retainedTailItems: maxTailItems
        },
        ...cloned
      ];
    }
    return cloned;
  }
  const result = {};
  const entries = Object.entries(value);
  const maxKeys = getChatLogMaxObjectKeys();
  for (const [key, item] of maxKeys > 0 ? entries.slice(0, maxKeys) : entries) {
    result[key] = cloneBoundedChatLogPayload(item, depth + 1);
  }
  if (maxKeys > 0 && entries.length > maxKeys) {
    result._omniroute_truncated_keys = entries.length - maxKeys;
  }
  return result;
}
function truncateForLog(value) {
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  const maxBodyBytes = getChatLogMaxBodyBytes();
  const estimatedSize = estimateSizeFast(value, maxBodyBytes);
  if (estimatedSize <= maxBodyBytes) return value;
  const obj = value;
  const summary = {
    _truncated: true,
    _originalBytes: estimatedSize
  };
  if (typeof obj.model === "string") summary.model = obj.model;
  if (typeof obj.provider === "string") summary.provider = obj.provider;
  if (Array.isArray(obj.messages)) summary.messageCount = obj.messages.length;
  else if (Array.isArray(obj.input)) summary.messageCount = obj.input.length;
  if (Array.isArray(obj.contents)) summary.contentCount = obj.contents.length;
  if (typeof obj.stream === "boolean") summary.stream = obj.stream;
  if (Array.isArray(obj.tools)) summary.tools = cloneBoundedChatLogPayload(obj.tools);
  return summary;
}
export {
  MEMORY_EXTRACTION_TEXT_LIMIT,
  capMemoryExtractionText,
  cloneBoundedChatLogPayload,
  truncateChatLogText,
  truncateForLog
};
