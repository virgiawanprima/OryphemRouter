function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function ensureToolMessageNames(record) {
  if (!Array.isArray(record.messages)) return record;
  const callIdToName = /* @__PURE__ */ new Map();
  for (const msg of record.messages) {
    const m = asRecord(msg);
    if (!m || m.role !== "assistant" || !Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      if (tc?.id && typeof tc.function?.name === "string") {
        callIdToName.set(String(tc.id), tc.function.name);
      }
    }
  }
  if (callIdToName.size === 0) return record;
  let modified = false;
  const messages = record.messages.map((msg) => {
    const m = asRecord(msg);
    if (!m || m.role !== "tool" || typeof m.name === "string") return msg;
    const callId = String(m.tool_call_id ?? "");
    const resolvedName = callIdToName.get(callId);
    if (!resolvedName) return msg;
    modified = true;
    return { ...m, name: resolvedName };
  });
  return modified ? { ...record, messages } : record;
}
export {
  ensureToolMessageNames
};
