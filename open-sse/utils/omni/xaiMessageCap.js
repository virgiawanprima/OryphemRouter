import {
  fixToolAdjacency,
  fixToolPairs,
  stripTrailingAssistantOrphanToolUse
} from "./xaiContextManager.js";
const XAI_CHAT_HISTORY_LIMIT = 800;
function isSystemRole(item) {
  return item.role === "system" || item.role === "developer";
}
function repairChatMessages(messages) {
  let result = fixToolPairs(messages);
  result = fixToolAdjacency(result);
  result = fixToolPairs(result);
  return stripTrailingAssistantOrphanToolUse(result);
}
function capXaiChatMessages(messages, limit = XAI_CHAT_HISTORY_LIMIT) {
  if (!Array.isArray(messages) || messages.length <= limit) return messages;
  const system = messages.filter(isSystemRole);
  const nonSystem = messages.filter((item) => !isSystemRole(item));
  const budget = Math.max(2, limit - system.length);
  let result = repairChatMessages([...system, ...nonSystem.slice(-budget)]);
  if (result.length > limit) {
    result = repairChatMessages(result.slice(-limit));
  }
  return result;
}
function lastUserIndex(items) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].role === "user") return i;
  }
  return -1;
}
function repairXaiResponsesInput(items) {
  const callIds = /* @__PURE__ */ new Set();
  const outputIds = /* @__PURE__ */ new Set();
  for (const item of items) {
    if (typeof item.call_id !== "string") continue;
    if (item.type === "function_call") callIds.add(item.call_id);
    if (item.type === "function_call_output") outputIds.add(item.call_id);
  }
  const lastUser = lastUserIndex(items);
  return items.filter((item, idx) => {
    if (item.type === "function_call_output") {
      return typeof item.call_id === "string" && callIds.has(item.call_id);
    }
    if (item.type === "function_call") {
      if (typeof item.call_id === "string" && outputIds.has(item.call_id)) return true;
      return lastUser < 0 || idx > lastUser;
    }
    return true;
  });
}
function capXaiResponsesInput(input, limit = XAI_CHAT_HISTORY_LIMIT) {
  if (!Array.isArray(input) || input.length <= limit) return input;
  let result = repairXaiResponsesInput(input.slice(-limit));
  if (result.length > limit) {
    result = repairXaiResponsesInput(result.slice(-limit));
  }
  return result;
}
function capXaiRequestHistory(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  let changed = false;
  if (Array.isArray(body.messages)) {
    const messages = capXaiChatMessages(body.messages);
    if (messages !== body.messages) {
      next.messages = messages;
      changed = true;
    }
  }
  if (Array.isArray(body.input)) {
    const input = capXaiResponsesInput(body.input);
    if (input !== body.input) {
      next.input = input;
      changed = true;
    }
  }
  return changed ? next : body;
}
export {
  XAI_CHAT_HISTORY_LIMIT,
  capXaiChatMessages,
  capXaiRequestHistory,
  capXaiResponsesInput,
  repairXaiResponsesInput
};
