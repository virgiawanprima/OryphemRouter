const CCR_RETRIEVE_TOOL_NAME = "omniroute_ccr_retrieve";
const CCR_PROTOCOL_MARKER_SENTINEL = "[CCR protocol]";
const CCR_PROTOCOL_INSTRUCTION = `${CCR_PROTOCOL_MARKER_SENTINEL} This conversation uses content-compression-retrieve (CCR). When you see a marker like \`[CCR retrieve hash=<24hex> chars=N]\` in a message, it means the full original text (N characters) was stored and replaced with this marker to save space \u2014 call the \`${CCR_RETRIEVE_TOOL_NAME}\` tool with that hash to get the original text back verbatim. Copy the hash EXACTLY as written \u2014 all 24 hexadecimal characters, never truncated, abbreviated, or reformatted \u2014 a single wrong character will make the retrieval fail. If you instead see a marker like \`[dedup:ref sha=...]\`, it means that content already appeared earlier in this conversation \u2014 look back in the message history for it; do NOT call ${CCR_RETRIEVE_TOOL_NAME} for a dedup reference.`;
function callerSupportsCcrRetrieve(body) {
  const tools = body["tools"];
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) => {
    const t = tool;
    const flatName = typeof t?.name === "string" ? t.name : void 0;
    const nestedName = typeof t?.function?.name === "string" ? t.function.name : void 0;
    return flatName === CCR_RETRIEVE_TOOL_NAME || nestedName === CCR_RETRIEVE_TOOL_NAME;
  });
}
function messageContainsSentinel(message) {
  const content = message?.content;
  if (typeof content === "string") return content.includes(CCR_PROTOCOL_MARKER_SENTINEL);
  if (Array.isArray(content)) {
    return content.some(
      (part) => part && typeof part === "object" && typeof part["text"] === "string" && part["text"].includes(
        CCR_PROTOCOL_MARKER_SENTINEL
      )
    );
  }
  return false;
}
function injectCcrProtocolInstruction(messages, body) {
  if (!callerSupportsCcrRetrieve(body)) return messages;
  if (messages.some((message) => messageContainsSentinel(message))) return messages;
  const instructionMessage = {
    role: "system",
    content: CCR_PROTOCOL_INSTRUCTION
  };
  return [instructionMessage, ...messages];
}
export {
  CCR_PROTOCOL_INSTRUCTION,
  CCR_PROTOCOL_MARKER_SENTINEL,
  callerSupportsCcrRetrieve,
  injectCcrProtocolInstruction
};
