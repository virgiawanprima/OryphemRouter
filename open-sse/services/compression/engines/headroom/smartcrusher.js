import { encodeTabularBlock, wrapTabular, kindOf } from "./tabular.js";
import { encodeToonBlock, wrapToon } from "./toon.js";
const DEFAULT_MIN_ROWS = 8;
const JSON_FENCE_RE = /```json\n([\s\S]*?)\n```/g;
function detectHomogeneous(arr) {
  if (arr.length === 0) return null;
  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
  }
  const firstKeys = Object.keys(arr[0]).sort();
  for (const item of arr.slice(1)) {
    const itemKeys = Object.keys(item).sort();
    if (itemKeys.length !== firstKeys.length) return null;
    for (let i = 0; i < firstKeys.length; i++) {
      if (itemKeys[i] !== firstKeys[i]) return null;
    }
  }
  const first = arr[0];
  for (const key of firstKeys) {
    const expected = kindOf(first[key]);
    for (const item of arr) {
      if (kindOf(item[key]) !== expected) return null;
    }
  }
  return firstKeys;
}
function allObjects(arr) {
  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
  }
  return true;
}
function tryCompactJson(jsonStr, minRows = DEFAULT_MIN_ROWS) {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < minRows) return null;
  if (!allObjects(parsed)) return null;
  const arr = parsed;
  const compact = pickSmallestEncoding(arr);
  if (compact.length >= jsonStr.length) return null;
  return compact;
}
function pickSmallestEncoding(arr) {
  const gcf = wrapTabular(encodeTabularBlock(arr));
  const toonInner = encodeToonBlock(arr);
  if (toonInner !== null) {
    const toon = wrapToon(toonInner);
    if (toon.length < gcf.length) return toon;
  }
  return gcf;
}
function collectCompactableArrays(messages, minRows = DEFAULT_MIN_ROWS) {
  const out = [];
  const pushIfCompactable = (jsonStr) => {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return;
    }
    if (!Array.isArray(parsed) || parsed.length < minRows) return;
    if (!allObjects(parsed)) return;
    out.push(parsed);
  };
  const scanText = (text) => {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("[")) pushIfCompactable(text.trim());
    const regex = new RegExp(JSON_FENCE_RE.source, "g");
    let m;
    while ((m = regex.exec(text)) !== null) pushIfCompactable(m[1].trim());
  };
  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") continue;
    if (typeof msg.content === "string") scanText(msg.content);
    else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part["type"] === "text" && typeof part["text"] === "string")
          scanText(part["text"]);
      }
    }
  }
  return out;
}
function crushText(text, minRows = DEFAULT_MIN_ROWS) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    const compacted = tryCompactJson(text.trim(), minRows);
    if (compacted !== null) return compacted;
  }
  let result = text;
  let offset = 0;
  const regex = new RegExp(JSON_FENCE_RE.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const innerJson = match[1];
    const compacted = tryCompactJson(innerJson.trim(), minRows);
    if (compacted !== null) {
      const start = match.index + offset;
      const end = start + fullMatch.length;
      result = result.slice(0, start) + compacted + result.slice(end);
      offset += compacted.length - fullMatch.length;
    }
  }
  return result;
}
function crushMessages(messages, minRows = DEFAULT_MIN_ROWS) {
  let changed = false;
  const result = messages.map((msg) => {
    if (msg.role === "system" || msg.role === "developer") return { ...msg };
    if (typeof msg.content === "string") {
      const crushed = crushText(msg.content, minRows);
      if (crushed !== msg.content) {
        changed = true;
        return { ...msg, content: crushed };
      }
      return { ...msg };
    }
    if (Array.isArray(msg.content)) {
      let contentChanged = false;
      const newContent = msg.content.map((part) => {
        if (part["type"] !== "text" || typeof part["text"] !== "string") return part;
        const crushed = crushText(part["text"], minRows);
        if (crushed !== part["text"]) {
          contentChanged = true;
          return { ...part, text: crushed };
        }
        return part;
      });
      if (contentChanged) {
        changed = true;
        return { ...msg, content: newContent };
      }
      return { ...msg };
    }
    return { ...msg };
  });
  return { messages: result, changed };
}
export {
  DEFAULT_MIN_ROWS,
  collectCompactableArrays,
  crushMessages,
  crushText,
  detectHomogeneous,
  pickSmallestEncoding,
  tryCompactJson
};
