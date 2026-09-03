import { createHash } from "node:crypto";
const ALPHANUM9 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function aliasOpenAIToolName(name, maxLength, aliases) {
  if (typeof name !== "string" || name.length === 0) return name;
  const safe = name.replace(/[^A-Za-z0-9_-]/g, "_");
  if (safe === name && safe.length <= maxLength) return safe;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 12);
  const prefixLength = Math.max(0, maxLength - hash.length - 1);
  const shortened = prefixLength > 0 ? `${safe.slice(0, prefixLength)}_${hash}` : hash.slice(0, maxLength);
  aliases.set(shortened, name);
  return shortened;
}
function normalizeOpenAIToolNames(body, maxLength) {
  const aliases = /* @__PURE__ */ new Map();
  const root = toRecord(body);
  if (!root || !Number.isInteger(maxLength) || maxLength < 1) return aliases;
  const alias = (name) => aliasOpenAIToolName(name, maxLength, aliases);
  if (Array.isArray(root.tools)) {
    for (const tool of root.tools) {
      const fn = toRecord(toRecord(tool)?.function);
      if (fn && typeof fn.name === "string") fn.name = alias(fn.name);
    }
  }
  const toolChoiceFunction = toRecord(toRecord(root.tool_choice)?.function);
  if (toolChoiceFunction && typeof toolChoiceFunction.name === "string") {
    toolChoiceFunction.name = alias(toolChoiceFunction.name);
  }
  if (Array.isArray(root.messages)) {
    for (const message of root.messages) {
      const msg = toRecord(message);
      if (!msg) continue;
      if (Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
          const fn = toRecord(toRecord(toolCall)?.function);
          if (fn && typeof fn.name === "string") fn.name = alias(fn.name);
        }
      }
      if (msg.role === "tool" && typeof msg.name === "string") {
        msg.name = alias(msg.name);
      }
    }
  }
  return aliases;
}
function caseInsensitiveToolNameLookup(name, map) {
  if (!map || !name) return void 0;
  const exact = map.get(name);
  if (exact !== void 0) return exact;
  const lowerName = name.toLowerCase();
  for (const [key, value] of map) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return void 0;
}
function restoreOpenAIToolNames(body, aliases) {
  if (!(aliases instanceof Map) || aliases.size === 0) return false;
  const root = toRecord(body);
  if (!root || !Array.isArray(root.choices)) return false;
  let changed = false;
  const restoreCalls = (calls) => {
    if (!Array.isArray(calls)) return;
    for (const toolCall of calls) {
      const fn = toRecord(toRecord(toolCall)?.function);
      if (!fn || typeof fn.name !== "string") continue;
      const original = caseInsensitiveToolNameLookup(fn.name, aliases);
      if (typeof original !== "string" || original === fn.name) continue;
      fn.name = original;
      changed = true;
    }
  };
  for (const choice of root.choices) {
    const record = toRecord(choice);
    if (!record) continue;
    restoreCalls(toRecord(record.delta)?.tool_calls);
    restoreCalls(toRecord(record.message)?.tool_calls);
  }
  return changed;
}
function fallbackToolCallId(index) {
  return index === void 0 ? `call_${Date.now()}` : `call_${index}_${Date.now()}`;
}
function generateToolCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
function generateToolCallId9() {
  let s = "";
  for (let i = 0; i < 9; i++) {
    s += ALPHANUM9[Math.floor(Math.random() * ALPHANUM9.length)];
  }
  return s;
}
function ensureToolCallIds(body, options) {
  if (!body.messages || !Array.isArray(body.messages)) return body;
  const use9CharId = options?.use9CharId === true;
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls || !Array.isArray(msg.tool_calls)) continue;
    const used9 = /* @__PURE__ */ new Set();
    const newIdsInOrder = [];
    for (const tc of msg.tool_calls) {
      if (!tc.type) {
        tc.type = "function";
      }
      if (tc.function?.arguments && typeof tc.function.arguments !== "string") {
        tc.function.arguments = JSON.stringify(tc.function.arguments);
      }
      if (use9CharId) {
        let newId;
        do {
          newId = generateToolCallId9();
        } while (used9.has(newId));
        used9.add(newId);
        newIdsInOrder.push(newId);
        tc.id = newId;
      } else {
        const id = tc.id != null && String(tc.id).trim() !== "" ? String(tc.id) : generateToolCallId();
        tc.id = id;
        newIdsInOrder.push(id);
      }
    }
    if (newIdsInOrder.length > 0) {
      let idx = 0;
      for (let j = i + 1; j < body.messages.length; j++) {
        const later = body.messages[j];
        if (later.role === "assistant") break;
        if (later.role !== "tool") continue;
        if (idx < newIdsInOrder.length) {
          if (use9CharId || later.tool_call_id == null || String(later.tool_call_id).trim() === "") {
            later.tool_call_id = newIdsInOrder[idx];
          }
          idx++;
        }
      }
    }
  }
  return body;
}
function getToolCallIds(msg) {
  if (msg.role !== "assistant") return [];
  const ids = [];
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      if (tc.id) ids.push(String(tc.id));
    }
  }
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.id) {
        ids.push(String(block.id));
      }
    }
  }
  return ids;
}
function hasToolResults(msg, toolCallIds) {
  if (!msg || !toolCallIds.length) return false;
  if (msg.role === "tool" && msg.tool_call_id) {
    return toolCallIds.includes(String(msg.tool_call_id));
  }
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_result" && block.tool_use_id && toolCallIds.includes(String(block.tool_use_id))) {
        return true;
      }
    }
  }
  return false;
}
function fixMissingToolResponses(body) {
  if (!body.messages || !Array.isArray(body.messages)) return body;
  const newMessages = [];
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    const nextMsg = body.messages[i + 1];
    newMessages.push(msg);
    const toolCallIds = getToolCallIds(msg);
    if (toolCallIds.length === 0) continue;
    if (nextMsg && !hasToolResults(nextMsg, toolCallIds)) {
      const hasOpenAIToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
      if (hasOpenAIToolCalls) {
        for (const id of toolCallIds) {
          newMessages.push({
            role: "tool",
            tool_call_id: id,
            content: ""
          });
        }
      } else {
        newMessages.push({
          role: "user",
          content: toolCallIds.map((id) => ({
            type: "tool_result",
            tool_use_id: id,
            content: ""
          }))
        });
      }
    }
  }
  body.messages = newMessages;
  return body;
}
function stripOrphanedToolResults(body) {
  if (!body.messages || !Array.isArray(body.messages)) return body;
  const knownCallIds = /* @__PURE__ */ new Set();
  for (const msg of body.messages) {
    for (const id of getToolCallIds(msg)) {
      knownCallIds.add(id);
    }
  }
  let changed = false;
  const filteredMessages = [];
  for (const msg of body.messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      if (knownCallIds.has(String(msg.tool_call_id))) {
        filteredMessages.push(msg);
      } else {
        changed = true;
      }
      continue;
    }
    if (Array.isArray(msg.content)) {
      const cleanedContent = msg.content.filter((block) => {
        if (block?.type !== "tool_result") return true;
        return typeof block.tool_use_id === "string" && knownCallIds.has(block.tool_use_id);
      });
      if (cleanedContent.length !== msg.content.length) {
        changed = true;
        if (cleanedContent.length === 0) continue;
        msg.content = cleanedContent;
      }
    }
    filteredMessages.push(msg);
  }
  if (!changed) return body;
  body.messages = filteredMessages;
  return body;
}
export {
  caseInsensitiveToolNameLookup,
  ensureToolCallIds,
  fallbackToolCallId,
  fixMissingToolResponses,
  generateToolCallId,
  getToolCallIds,
  hasToolResults,
  normalizeOpenAIToolNames,
  restoreOpenAIToolNames,
  stripOrphanedToolResults
};
