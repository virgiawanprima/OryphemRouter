function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const p = part;
        if (typeof p.text === "string") return p.text;
        if (typeof p.content === "string") return p.content;
        if (typeof p.name === "string") {
          const args = p.arguments ?? p.input ?? p.args;
          return `${p.name}:${typeof args === "string" ? args : JSON.stringify(args ?? {})}`;
        }
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }
  return "";
}
function extractToolCallsText(message) {
  if (!message) return "";
  const parts = [];
  const tcs = message.tool_calls;
  if (Array.isArray(tcs)) {
    for (const tc of tcs) {
      if (!tc || typeof tc !== "object") continue;
      const rec = tc;
      const fn = rec.function;
      if (fn && typeof fn === "object") {
        const f = fn;
        const name = typeof f.name === "string" ? f.name : "";
        const args = typeof f.arguments === "string" ? f.arguments : JSON.stringify(f.arguments ?? {});
        if (name) parts.push(`tool_call:${name}:${args}`);
      } else if (typeof rec.name === "string") {
        parts.push(`tool_call:${rec.name}:${JSON.stringify(rec.arguments ?? rec.input ?? {})}`);
      }
    }
  }
  const fc = message.function_call;
  if (fc && typeof fc === "object") {
    const f = fc;
    const name = typeof f.name === "string" ? f.name : "";
    const args = typeof f.arguments === "string" ? f.arguments : JSON.stringify(f.arguments ?? {});
    if (name) parts.push(`function_call:${name}:${args}`);
  }
  return parts.join("\n");
}
function extractMessageTextFromMessage(message) {
  if (!message) return "";
  const fromContent = extractMessageText(message.content);
  const fromTools = extractToolCallsText(message);
  if (fromContent && fromTools) return `${fromContent}
${fromTools}`;
  return fromContent || fromTools;
}
function isUserLikeRole(role) {
  const r = (role || "").toLowerCase();
  return r === "user" || r === "human" || r === "tool" || r === "function";
}
export {
  extractMessageText,
  extractMessageTextFromMessage,
  extractToolCallsText,
  isUserLikeRole
};
