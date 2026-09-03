function isTextBlock(value) {
  return !!value && typeof value === "object" && "text" in value && typeof value.text === "string" && (value.type === void 0 || value.type === "text" || value.type === "input_text");
}
function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const textParts = [];
  for (const part of content) {
    if (isTextBlock(part) && part.text) {
      textParts.push(part.text);
    }
  }
  return textParts.join("\n");
}
function mapTextContent(msg, transform) {
  if (typeof msg.content === "string") {
    return { ...msg, content: transform(msg.content, 0) };
  }
  if (!Array.isArray(msg.content)) return msg;
  let textIndex = 0;
  let changed = false;
  const content = msg.content.map((part) => {
    if (!isTextBlock(part)) return part;
    const nextText = transform(part.text ?? "", textIndex);
    textIndex++;
    if (nextText === part.text) return part;
    changed = true;
    return { ...part, text: nextText };
  });
  return changed ? { ...msg, content } : msg;
}
function replaceTextContent(msg, newText) {
  if (typeof msg.content === "string" || !Array.isArray(msg.content)) {
    return { ...msg, content: newText };
  }
  let replaced = false;
  const content = msg.content.flatMap((part) => {
    if (!isTextBlock(part)) return [part];
    if (!replaced) {
      replaced = true;
      return [{ ...part, text: newText }];
    }
    const partText = part.text ?? "";
    if (partText && !newText.includes(partText)) return [part];
    return [];
  });
  if (!replaced) {
    return { ...msg, content: [{ type: "text", text: newText }, ...msg.content] };
  }
  return { ...msg, content };
}
export {
  extractTextContent,
  isTextBlock,
  mapTextContent,
  replaceTextContent
};
