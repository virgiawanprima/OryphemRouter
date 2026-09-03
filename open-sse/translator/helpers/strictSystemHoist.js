import { systemMessageMustBeFirst } from "../../utils/omni/systemMessageMustBeFirst.js";
function toTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((part) => {
      return Boolean(part) && typeof part === "object" && part.type === "text";
    }).map((part) => String(part.text ?? "")).join("\n");
  }
  return "";
}
function hoistLeadingSystemMessage(messages, provider) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (!systemMessageMustBeFirst(provider)) return messages;
  const offendingIndices = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i]?.role === "system") offendingIndices.push(i);
  }
  if (offendingIndices.length === 0) return messages;
  const offending = offendingIndices.map((i) => messages[i]);
  const rest = messages.filter((_, i) => !offendingIndices.includes(i));
  const mergedText = [
    rest[0]?.role === "system" ? toTextContent(rest[0].content) : null,
    ...offending.map((m) => toTextContent(m.content))
  ].filter((text) => Boolean(text)).join("\n");
  if (rest[0]?.role === "system") {
    const mergedFirst = { ...rest[0], content: mergedText };
    return [mergedFirst, ...rest.slice(1)];
  }
  const leadingSystem = { role: "system", content: mergedText };
  return [leadingSystem, ...rest];
}
export {
  hoistLeadingSystemMessage
};
