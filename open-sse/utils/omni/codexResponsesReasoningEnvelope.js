const BRIDGE_REASONING_PREFIX = "ocxr1:";
function encodeReasoningEnvelope(envelope) {
  return BRIDGE_REASONING_PREFIX + Buffer.from(JSON.stringify(envelope), "utf-8").toString("base64");
}
function decodeReasoningEnvelope(encryptedContent) {
  if (!encryptedContent.startsWith(BRIDGE_REASONING_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encryptedContent.slice(BRIDGE_REASONING_PREFIX.length), "base64").toString(
        "utf-8"
      )
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed;
    const envelope = {};
    if (typeof obj.sig === "string") envelope.sig = obj.sig;
    if (Array.isArray(obj.red)) {
      const red = obj.red.filter((r) => typeof r === "string");
      if (red.length > 0) envelope.red = red;
    }
    const txt = parsed.txt;
    if (typeof txt === "string" && txt.length > 0) envelope.txt = txt;
    return envelope.sig || envelope.red || envelope.txt ? envelope : null;
  } catch {
    return null;
  }
}
export {
  BRIDGE_REASONING_PREFIX,
  decodeReasoningEnvelope,
  encodeReasoningEnvelope
};
