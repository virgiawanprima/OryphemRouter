function echoModelInObject(obj, echoModel) {
  if (!echoModel) return obj;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const rec = obj;
    if (typeof rec.model === "string") {
      rec.model = echoModel;
    }
    const nested = rec.response;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRec = nested;
      if (typeof nestedRec.model === "string") {
        nestedRec.model = echoModel;
      }
    }
  }
  return obj;
}
function echoModelInSseLine(line, echoModel) {
  if (!echoModel) return line;
  if (!line.startsWith("data:")) return line;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]" || payload[0] !== "{") return line;
  try {
    const parsed = JSON.parse(payload);
    let changed = false;
    if (typeof parsed.model === "string") {
      parsed.model = echoModel;
      changed = true;
    }
    const nested = parsed.response;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRec = nested;
      if (typeof nestedRec.model === "string") {
        nestedRec.model = echoModel;
        changed = true;
      }
    }
    if (!changed) return line;
    return `data: ${JSON.stringify(parsed)}`;
  } catch {
    return line;
  }
}
function createModelEchoTransform(echoModel) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lastNewline = buffer.lastIndexOf("\n");
      if (lastNewline === -1) return;
      const ready = buffer.slice(0, lastNewline + 1);
      buffer = buffer.slice(lastNewline + 1);
      const rewritten = ready.split("\n").map((line) => echoModelInSseLine(line, echoModel)).join("\n");
      controller.enqueue(encoder.encode(rewritten));
    },
    flush(controller) {
      const tail = buffer + decoder.decode();
      if (tail) controller.enqueue(encoder.encode(echoModelInSseLine(tail, echoModel)));
    }
  });
}
export {
  createModelEchoTransform,
  echoModelInObject,
  echoModelInSseLine
};
