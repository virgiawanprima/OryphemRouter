function normalizeAgentMessageForChat(item) {
  if (item.type !== "agent_message") return null;
  if (!Array.isArray(item.content)) return null;
  const textParts = [];
  for (const partValue of item.content) {
    if (!partValue || typeof partValue !== "object" || Array.isArray(partValue)) {
      return null;
    }
    const part = partValue;
    if (part.type === "encrypted_content") {
      return null;
    }
    if (part.type !== "input_text" || typeof part.text !== "string") return null;
    textParts.push(part.text);
  }
  const text = textParts.join("\n");
  if (!text.trim()) return null;
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "input_text", text }]
  };
}
function textPartTypeForRole(role) {
  return role === "assistant" ? "output_text" : "input_text";
}
function normalizeCodexMessageContentPart(part, role) {
  if (typeof part === "string") return { type: textPartTypeForRole(role), text: part };
  if (!part || typeof part !== "object" || Array.isArray(part)) return part;
  const record = { ...part };
  if (record.type === "text") record.type = textPartTypeForRole(role);
  if (role === "assistant" && (record.type === "input_text" || record.type === "text")) {
    record.type = "output_text";
    delete record.annotations;
    delete record.logprobs;
    delete record.obfuscation;
  }
  return record;
}
function buildCodexMessageContent(item, role) {
  if (Array.isArray(item.content)) {
    return item.content.map((part) => normalizeCodexMessageContentPart(part, role));
  }
  if (typeof item.content === "string") {
    return [{ type: textPartTypeForRole(role), text: item.content }];
  }
  if (typeof item.text === "string") {
    return [{ type: textPartTypeForRole(role), text: item.text }];
  }
  return [];
}
function normalizeCodexResponsesInputItem(itemValue) {
  if (typeof itemValue === "string") {
    return { type: "message", role: "user", content: [{ type: "input_text", text: itemValue }] };
  }
  if (!itemValue || typeof itemValue !== "object" || Array.isArray(itemValue)) return itemValue;
  const item = { ...itemValue };
  const role = typeof item.role === "string" ? item.role : "user";
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "additional_tools") {
    delete item.content;
    return item;
  }
  if (!type && item.content === void 0 && typeof item.text === "string") {
    return {
      type: "message",
      role,
      content: [{ type: textPartTypeForRole(role), text: item.text }]
    };
  }
  if (!type && role) item.type = "message";
  if (item.type === "message" || !type && item.content !== void 0) {
    item.role = role;
    item.content = buildCodexMessageContent(item, role);
    item.type = "message";
  }
  return item;
}
function normalizeCodexResponsesInput(body) {
  if (Array.isArray(body.input)) {
    body.input = body.input.map(normalizeCodexResponsesInputItem);
    return;
  }
  if (body.input === void 0) return;
  body.input = body.input === null ? [] : [normalizeCodexResponsesInputItem(body.input)];
}
function normalizeResponsesInputItemForChat(value) {
  if (typeof value === "string") {
    return { type: "message", role: "user", content: [{ type: "input_text", text: value }] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = { ...value };
  const hasType = typeof item.type === "string" && item.type.length > 0;
  const hasRole = typeof item.role === "string" && item.role.length > 0;
  const agentMessage = normalizeAgentMessageForChat(item);
  if (agentMessage) return agentMessage;
  if (item.type === "agent_message") {
    return { type: "reasoning" };
  }
  if (hasType || hasRole) {
    if (!hasType && hasRole) item.type = "message";
    return item;
  }
  if (typeof item.text === "string") {
    return { type: "message", role: "user", content: [{ type: "input_text", text: item.text }] };
  }
  if (item.content !== void 0) return { type: "message", role: "user", content: item.content };
  return item;
}
function normalizeResponsesInputForChat(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input.map(normalizeResponsesInputItemForChat);
  return [normalizeResponsesInputItemForChat(input)];
}
export {
  normalizeCodexResponsesInput,
  normalizeResponsesInputForChat
};
