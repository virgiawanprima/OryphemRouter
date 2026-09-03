const DEFAULT_DETECTION_PATTERNS = [
  "generate a title",
  "generate title",
  "create a title",
  "create a short",
  "summarize this",
  "summarize the",
  "write a brief",
  "write a summary",
  "one-line summary",
  "one line summary",
  "short description",
  "brief description",
  "conversation title",
  "chat title",
  "name this conversation",
  "name this chat",
  "title for this",
  "suggest a title",
  "label this"
];
const DEFAULT_DEGRADATION_MAP = {
  // Premium → Cheap alternatives
  "claude-opus-4-6": "gemini-3-flash",
  "claude-opus-4-6-thinking": "gemini-3-flash",
  "claude-opus-4-5-20251101": "gemini-3-flash",
  "claude-sonnet-4-5-20250929": "gemini-3-flash",
  "claude-sonnet-4-20250514": "gemini-3-flash",
  "claude-sonnet-4": "gemini-3-flash",
  "gemini-3.1-pro": "gemini-3-flash",
  "gemini-3.1-pro-high": "gemini-3-flash",
  "gemini-3-pro-preview": "gemini-3-flash-preview",
  "gemini-2.5-pro": "gemini-3-flash",
  "gpt-4o": "gpt-4o-mini",
  "gpt-5": "gpt-5-mini",
  "gpt-5.1": "gpt-5-mini",
  "gpt-5.1-codex": "gpt-5.1-codex-mini"
};
const GLOBAL_KEY = "__omniroute_backgroundDegradation_config__";
const _store = globalThis;
function getConfig() {
  if (!_store[GLOBAL_KEY]) {
    _store[GLOBAL_KEY] = {
      enabled: false,
      // Disabled by default — user must opt in
      degradationMap: { ...DEFAULT_DEGRADATION_MAP },
      detectionPatterns: [...DEFAULT_DETECTION_PATTERNS],
      stats: { detected: 0, tokensSaved: 0 }
    };
  }
  return _store[GLOBAL_KEY];
}
function setBackgroundDegradationConfig(config) {
  _store[GLOBAL_KEY] = {
    ...getConfig(),
    ...config,
    stats: getConfig().stats
    // preserve stats across config changes
  };
}
function getBackgroundDegradationConfig() {
  return {
    ...getConfig(),
    degradationMap: { ...getConfig().degradationMap },
    detectionPatterns: [...getConfig().detectionPatterns],
    stats: { ...getConfig().stats }
  };
}
function resetStats() {
  getConfig().stats = { detected: 0, tokensSaved: 0 };
}
function toMessageArray(value) {
  return Array.isArray(value) ? value : [];
}
function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function headerValue(headers, key) {
  if (!headers) return "";
  const value = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  return typeof value === "string" ? value.trim() : "";
}
function getBackgroundTaskReason(body, headers = null) {
  if (!body || typeof body !== "object") return null;
  const typedBody = body;
  if (headers) {
    const taskType = headerValue(headers, "x-task-type");
    const priority = headerValue(headers, "x-request-priority");
    const initiator = headerValue(headers, "x-initiator");
    const explicitValue = [taskType, priority, initiator].find(Boolean);
    if (explicitValue && explicitValue.toLowerCase() === "background") {
      return "header_background";
    }
  }
  const maxTokens = toFiniteNumber(
    typedBody.max_tokens ?? typedBody.max_completion_tokens ?? typedBody.max_output_tokens
  );
  if (maxTokens !== null && maxTokens > 0 && maxTokens < 50) {
    return "low_max_tokens";
  }
  const messages = toMessageArray(typedBody.messages ?? typedBody.input ?? []);
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const systemMsg = messages.find(
    (message) => message.role === "system" || message.role === "developer"
  );
  let systemContent = "";
  if (systemMsg && typeof systemMsg.content === "string") {
    systemContent = systemMsg.content.toLowerCase();
  } else if (!systemMsg) {
    const raw = typedBody.system;
    if (typeof raw === "string") {
      systemContent = raw.toLowerCase();
    } else if (Array.isArray(raw)) {
      systemContent = raw.map(
        (part) => part && typeof part.text === "string" ? part.text : ""
      ).filter(Boolean).join(" ").toLowerCase();
    }
  }
  if (!systemContent) return null;
  const matched = getConfig().detectionPatterns.some(
    (pattern) => systemContent.includes(pattern.toLowerCase())
  );
  if (!matched) return null;
  const userMessages = messages.filter((message) => message.role === "user");
  if (userMessages.length > 3) return null;
  return "system_prompt_pattern";
}
function isBackgroundTask(body, headers = null) {
  return getBackgroundTaskReason(body, headers) !== null;
}
function getDegradedModel(originalModel) {
  if (!originalModel) return originalModel;
  const degraded = getConfig().degradationMap[originalModel];
  if (degraded) {
    getConfig().stats.detected++;
    return degraded;
  }
  return originalModel;
}
function getDefaultDegradationMap() {
  return { ...DEFAULT_DEGRADATION_MAP };
}
function getDefaultDetectionPatterns() {
  return [...DEFAULT_DETECTION_PATTERNS];
}
export {
  getBackgroundDegradationConfig,
  getBackgroundTaskReason,
  getDefaultDegradationMap,
  getDefaultDetectionPatterns,
  getDegradedModel,
  isBackgroundTask,
  resetStats,
  setBackgroundDegradationConfig
};
