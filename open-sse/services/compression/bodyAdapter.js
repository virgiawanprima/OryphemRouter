const CODEX_RESPONSE_ITEM_META = Symbol("codexResponseItemMeta");
const RESPONSES_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "message",
  "function_call_output",
  "custom_tool_call_output",
  "local_shell_call_output",
  "apply_patch_call_output"
]);
const COMPRESSION_INPUT_INDEX = Symbol("compressionInputIndex");
const KIRO_TOOL_RESULT_PATH = Symbol("kiroToolResultPath");
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizeRole(role, fallback) {
  return typeof role === "string" && role.length > 0 ? role : fallback;
}
function toChatContent(content, fallbackOutput) {
  return content === void 0 ? fallbackOutput : content;
}
function fromChatContent(nextContent, originalContent) {
  if (Array.isArray(originalContent) && typeof nextContent === "string") {
    let replaced = false;
    const mapped = originalContent.map((part) => {
      if (!isRecord(part) || typeof part.text !== "string") return part;
      if (replaced) return { ...part, text: "" };
      replaced = true;
      return { ...part, text: nextContent };
    });
    return replaced ? mapped : originalContent;
  }
  return nextContent;
}
function customToolOutputToChatContent(rawOutput) {
  if (typeof rawOutput !== "string") {
    if (isRecord(rawOutput) && typeof rawOutput.output === "string") return rawOutput.output;
    return rawOutput;
  }
  try {
    const parsed = JSON.parse(rawOutput);
    if (isRecord(parsed) && typeof parsed.output === "string") return parsed.output;
  } catch {
  }
  return rawOutput;
}
function restoreCustomToolOutput(nextContent, originalOutput) {
  if (typeof originalOutput === "string") {
    try {
      const parsed = JSON.parse(originalOutput);
      if (isRecord(parsed) && typeof parsed.output === "string") {
        return JSON.stringify({ ...parsed, output: nextContent });
      }
    } catch {
    }
  }
  if (isRecord(originalOutput) && typeof originalOutput.output === "string") {
    return { ...originalOutput, output: nextContent };
  }
  return fromChatContent(nextContent, originalOutput);
}
function responsesToolOutputField(item) {
  return item.output !== null && item.output !== void 0 ? "output" : "content";
}
function responsesItemToMessage(item) {
  const type = typeof item.type === "string" ? item.type : "message";
  if (!RESPONSES_MESSAGE_TYPES.has(type)) return null;
  if (type === "function_call_output" || type === "custom_tool_call_output" || type === "local_shell_call_output" || type === "apply_patch_call_output") {
    const rawOutput = item.output ?? item.content;
    const isObjectOutput = rawOutput !== null && rawOutput !== void 0 && typeof rawOutput === "object" && !Array.isArray(rawOutput);
    return {
      role: "tool",
      content: type === "custom_tool_call_output" ? customToolOutputToChatContent(rawOutput) : isObjectOutput ? JSON.stringify(rawOutput) : toChatContent(rawOutput),
      [CODEX_RESPONSE_ITEM_META]: { type, eligible: false }
    };
  }
  return {
    role: normalizeRole(item.role, "user"),
    content: toChatContent(item.content, item.output)
  };
}
const DEFAULT_CODEX_PROTECTED_TOOL_NAMES = /* @__PURE__ */ new Set([
  "read",
  "glob",
  "grep",
  "write",
  "edit",
  "websearch",
  "webfetch",
  "web_search",
  "web_fetch"
]);
function markCodexResponseEligibility(messages, inputItems, preserveToolNames = []) {
  const protectedNames = /* @__PURE__ */ new Set([
    ...DEFAULT_CODEX_PROTECTED_TOOL_NAMES,
    ...preserveToolNames.map((name) => name.trim().toLowerCase())
  ]);
  const functionCalls = /* @__PURE__ */ new Map();
  const skippedCallIds = /* @__PURE__ */ new Set();
  for (const raw of inputItems) {
    if (!isRecord(raw) || raw.type !== "function_call") continue;
    if (typeof raw.call_id !== "string" || raw.call_id.length === 0) continue;
    const name = typeof raw.name === "string" ? raw.name : "";
    functionCalls.set(raw.call_id, name);
    if (protectedNames.has(name.trim().toLowerCase()) || name === "headless_retrieval" || name.endsWith("__headless_retrieval")) {
      skippedCallIds.add(raw.call_id);
    }
  }
  for (const message of messages) {
    const meta = message[CODEX_RESPONSE_ITEM_META];
    if (!meta) continue;
    if (meta.type === "local_shell_call_output" || meta.type === "apply_patch_call_output") {
      meta.eligible = true;
      continue;
    }
    if (meta.type !== "function_call_output") continue;
    const rawIndex = message[COMPRESSION_INPUT_INDEX];
    const rawItem = typeof rawIndex === "number" ? inputItems[rawIndex] : null;
    const callId = isRecord(rawItem) && typeof rawItem.call_id === "string" ? rawItem.call_id : "";
    meta.eligible = callId.length > 0 && functionCalls.has(callId) && !skippedCallIds.has(callId);
  }
}
function messageToResponsesItem(message, originalItem) {
  const type = typeof originalItem.type === "string" ? originalItem.type : "message";
  if (type === "function_call_output" || type === "custom_tool_call_output" || type === "local_shell_call_output" || type === "apply_patch_call_output") {
    const outputField = responsesToolOutputField(originalItem);
    const originalOutput = originalItem[outputField];
    return {
      ...originalItem,
      [outputField]: type === "custom_tool_call_output" ? restoreCustomToolOutput(message.content, originalOutput) : fromChatContent(message.content, originalOutput)
    };
  }
  return {
    ...originalItem,
    content: fromChatContent(message.content, originalItem.content)
  };
}
function hasTextContent(message) {
  if (typeof message.content === "string") return message.content.length > 0;
  if (!Array.isArray(message.content)) return false;
  return message.content.some(
    (part) => isRecord(part) && typeof part.text === "string" && part.text.length > 0
  );
}
function isInlineBase64ImageUrl(value) {
  return typeof value === "string" && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}
function hasInlineImageContent(message) {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    if (!isRecord(part)) return false;
    if (part.type === "input_image" && isInlineBase64ImageUrl(part.image_url)) return true;
    if (part.type === "image_url") {
      const imageUrl = part.image_url;
      if (isInlineBase64ImageUrl(imageUrl)) return true;
      return isRecord(imageUrl) && isInlineBase64ImageUrl(imageUrl.url);
    }
    if (part.type === "image") {
      if (isInlineBase64ImageUrl(part.image)) return true;
      const source = part.source;
      return isRecord(source) && source.type === "base64" && typeof source.data === "string";
    }
    const inlineData = part.inlineData ?? part.inline_data;
    return isRecord(inlineData) && typeof inlineData.data === "string";
  });
}
function hasCompressibleContent(message) {
  return hasTextContent(message) || hasInlineImageContent(message);
}
function adaptBodyForCompression(body, preserveToolNames = []) {
  if (Array.isArray(body.messages)) {
    return {
      body,
      adapted: false,
      restore: (compressedBody) => compressedBody
    };
  }
  if (isRecord(body.conversationState)) {
    return adaptKiroBodyForCompression(body);
  }
  if (!Array.isArray(body.input) && typeof body.input !== "string") {
    return {
      body,
      adapted: false,
      restore: (compressedBody) => compressedBody
    };
  }
  const inputItems = Array.isArray(body.input) ? body.input : [{ type: "message", role: "user", content: body.input }];
  const mappings = [];
  const messages = [];
  inputItems.forEach((item, index) => {
    if (!isRecord(item)) return;
    const message = responsesItemToMessage(item);
    if (!message || !hasCompressibleContent(message)) return;
    mappings.push({ index, item });
    messages.push({ ...message, [COMPRESSION_INPUT_INDEX]: index });
  });
  markCodexResponseEligibility(messages, inputItems, preserveToolNames);
  if (messages.length === 0) {
    return {
      body,
      adapted: false,
      restore: (compressedBody) => compressedBody
    };
  }
  const bodyWithoutInput = { ...body };
  delete bodyWithoutInput.input;
  const mappedIndexSet = new Set(mappings.map((mapping) => mapping.index));
  return {
    body: { ...bodyWithoutInput, messages },
    adapted: true,
    restore(compressedBody, options = {}) {
      const dropMissingMappedItems = options.dropMissingMappedItems === true;
      const compressedMessagesByIndex = /* @__PURE__ */ new Map();
      if (Array.isArray(compressedBody.messages)) {
        for (const message of compressedBody.messages) {
          if (typeof message[COMPRESSION_INPUT_INDEX] === "number") {
            compressedMessagesByIndex.set(message[COMPRESSION_INPUT_INDEX], message);
          }
        }
      }
      if (!dropMissingMappedItems) {
        const nextInput2 = [...inputItems];
        mappings.forEach((mapping) => {
          const compressedMessage = compressedMessagesByIndex.get(mapping.index);
          if (!compressedMessage) return;
          nextInput2[mapping.index] = messageToResponsesItem(compressedMessage, mapping.item);
        });
        const rest2 = { ...compressedBody };
        delete rest2.messages;
        if (typeof body.input === "string") {
          const first = nextInput2[0];
          return { ...rest2, input: isRecord(first) ? first.content ?? body.input : body.input };
        }
        return { ...rest2, input: nextInput2 };
      }
      const nextInput = [];
      const survivingOutputKeys = /* @__PURE__ */ new Set();
      inputItems.forEach((item, index) => {
        if (mappedIndexSet.has(index)) {
          const compressedMessage = compressedMessagesByIndex.get(index);
          if (!compressedMessage) return;
          const mapping = mappings.find((entry) => entry.index === index);
          if (!mapping) return;
          const restored = messageToResponsesItem(compressedMessage, mapping.item);
          nextInput.push(restored);
          if (isRecord(restored) && (restored.type === "function_call_output" || restored.type === "custom_tool_call_output" || restored.type === "local_shell_call_output" || restored.type === "apply_patch_call_output") && typeof restored.call_id === "string") {
            survivingOutputKeys.add(`${restored.type}:${restored.call_id}`);
          }
          return;
        }
        nextInput.push(item);
      });
      const cleanedInput = nextInput.filter((item) => {
        if (!isRecord(item)) return true;
        const t = item.type;
        if (t !== "function_call" && t !== "custom_tool_call" && t !== "local_shell_call" && t !== "apply_patch_call") {
          return true;
        }
        if (typeof item.call_id !== "string" || item.call_id.length === 0) return true;
        const hadMappedOutput = mappings.some((mapping) => {
          const original = mapping.item;
          return (original.type === "function_call_output" || original.type === "custom_tool_call_output" || original.type === "local_shell_call_output" || original.type === "apply_patch_call_output") && original.call_id === item.call_id;
        });
        if (!hadMappedOutput) return true;
        const outputType = item.type === "custom_tool_call" ? "custom_tool_call_output" : "function_call_output";
        return survivingOutputKeys.has(`${outputType}:${item.call_id}`);
      });
      const rest = { ...compressedBody };
      delete rest.messages;
      if (typeof body.input === "string") {
        const first = cleanedInput[0];
        return { ...rest, input: isRecord(first) ? first.content ?? body.input : body.input };
      }
      return { ...rest, input: cleanedInput };
    }
  };
}
function adaptKiroBodyForCompression(body) {
  const state = body.conversationState;
  const history = Array.isArray(state.history) ? state.history : [];
  const currentMessage = isRecord(state.currentMessage) ? state.currentMessage : null;
  const messages = [];
  const collectFrom = (container, scope, historyIndex) => {
    const uim = container.userInputMessage;
    if (!isRecord(uim)) return;
    const ctx = uim.userInputMessageContext;
    if (!isRecord(ctx)) return;
    const toolResults = ctx.toolResults;
    if (!Array.isArray(toolResults)) return;
    toolResults.forEach((tr, trIdx) => {
      if (!isRecord(tr)) return;
      if (tr.status === "error") return;
      const content = tr.content;
      if (!Array.isArray(content)) return;
      content.forEach((part, partIdx) => {
        if (!isRecord(part)) return;
        if (typeof part.text !== "string" || part.text.length === 0) return;
        messages.push({
          role: "tool",
          content: part.text,
          [KIRO_TOOL_RESULT_PATH]: {
            scope,
            historyIndex,
            toolResultIndex: trIdx,
            contentIndex: partIdx
          }
        });
      });
    });
  };
  history.forEach((entry, idx) => {
    if (!isRecord(entry)) return;
    collectFrom(entry, "history", idx);
  });
  if (currentMessage) collectFrom(currentMessage, "currentMessage", -1);
  if (messages.length === 0) {
    return {
      body,
      adapted: false,
      restore: (compressedBody) => compressedBody
    };
  }
  return {
    body: { ...body, messages },
    adapted: true,
    restore(compressedBody) {
      const rewrites = /* @__PURE__ */ new Map();
      if (Array.isArray(compressedBody.messages)) {
        for (const message of compressedBody.messages) {
          const path = message[KIRO_TOOL_RESULT_PATH];
          if (!path) continue;
          let nextText = null;
          if (typeof message.content === "string") {
            nextText = message.content;
          } else if (Array.isArray(message.content)) {
            const firstText = message.content.find(
              (part) => isRecord(part) && typeof part.text === "string"
            );
            if (firstText) nextText = firstText.text;
          }
          if (nextText === null) continue;
          rewrites.set(kiroPathKey(path), nextText);
        }
      }
      const nextState = { ...state };
      if (history.length > 0) {
        nextState.history = history.map((entry, idx) => {
          if (!isRecord(entry)) return entry;
          return rewriteKiroEntry(entry, "history", idx, rewrites);
        });
      }
      if (currentMessage) {
        nextState.currentMessage = rewriteKiroEntry(currentMessage, "currentMessage", -1, rewrites);
      }
      const rest = { ...compressedBody };
      delete rest.messages;
      return { ...rest, conversationState: nextState };
    }
  };
}
function kiroPathKey(path) {
  return `${path.scope}|${path.historyIndex}|${path.toolResultIndex}|${path.contentIndex}`;
}
function rewriteKiroEntry(entry, scope, historyIndex, rewrites) {
  const uim = entry.userInputMessage;
  if (!isRecord(uim)) return entry;
  const ctx = uim.userInputMessageContext;
  if (!isRecord(ctx)) return entry;
  const toolResults = ctx.toolResults;
  if (!Array.isArray(toolResults)) return entry;
  let entryChanged = false;
  const nextToolResults = toolResults.map((tr, trIdx) => {
    if (!isRecord(tr)) return tr;
    const content = tr.content;
    if (!Array.isArray(content)) return tr;
    let trChanged = false;
    const nextContent = content.map((part, partIdx) => {
      if (!isRecord(part) || typeof part.text !== "string") return part;
      const key = kiroPathKey({
        scope,
        historyIndex,
        toolResultIndex: trIdx,
        contentIndex: partIdx
      });
      const rewritten = rewrites.get(key);
      if (rewritten === void 0 || rewritten === part.text) return part;
      trChanged = true;
      return { ...part, text: rewritten };
    });
    if (!trChanged) return tr;
    entryChanged = true;
    return { ...tr, content: nextContent };
  });
  if (!entryChanged) return entry;
  return {
    ...entry,
    userInputMessage: {
      ...uim,
      userInputMessageContext: { ...ctx, toolResults: nextToolResults }
    }
  };
}
export {
  CODEX_RESPONSE_ITEM_META,
  adaptBodyForCompression
};
