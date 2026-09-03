function getResponsesEventKeys(payload, item) {
  const keys = /* @__PURE__ */ new Set();
  const addStringKey = (prefix, value) => {
    if (typeof value === "string" && value.trim()) keys.add(`${prefix}:${value.trim()}`);
  };
  const addIndexKey = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      keys.add(`index:${value}`);
    }
  };
  addStringKey("item", payload.item_id);
  addStringKey("call", payload.call_id);
  addIndexKey(payload.output_index);
  if (item) {
    addStringKey("item", item.id);
    addStringKey("call", item.call_id);
  }
  return [...keys];
}
function createCompletedResponsesToolHandoffWatcher() {
  let buffer = "";
  let completed = false;
  const functionArgumentsDone = /* @__PURE__ */ new Map();
  const customToolInputDone = /* @__PURE__ */ new Map();
  const completedToolItems = [];
  const matchesDonePayload = (item) => {
    const doneValues = item.type === "function_call" ? functionArgumentsDone : customToolInputDone;
    return item.keys.some((key) => doneValues.get(key) === item.value);
  };
  const evaluate = () => {
    completed = completed || completedToolItems.some(matchesDonePayload);
  };
  const notePayload = (payload, eventType) => {
    if (eventType === "response.function_call_arguments.done" && typeof payload.arguments === "string") {
      for (const key of getResponsesEventKeys(payload)) {
        functionArgumentsDone.set(key, payload.arguments);
      }
      evaluate();
      return;
    }
    if (eventType === "response.custom_tool_call_input.done" && typeof payload.input === "string") {
      for (const key of getResponsesEventKeys(payload)) {
        customToolInputDone.set(key, payload.input);
      }
      evaluate();
      return;
    }
    if (eventType !== "response.output_item.done") return;
    const item = payload.item && typeof payload.item === "object" && !Array.isArray(payload.item) ? payload.item : null;
    if (!item) return;
    if (item.type !== "function_call" && item.type !== "custom_tool_call") return;
    if (typeof item.call_id !== "string" || !item.call_id.trim()) return;
    if (typeof item.name !== "string" || !item.name.trim()) return;
    if (item.status !== void 0 && item.status !== "completed") return;
    const valueKey = item.type === "function_call" ? "arguments" : "input";
    const value = item[valueKey];
    if (typeof value !== "string") return;
    const keys = getResponsesEventKeys(payload, item);
    if (keys.length === 0) return;
    completedToolItems.push({ keys, type: item.type, value });
    if (completedToolItems.length > 32) completedToolItems.shift();
    evaluate();
  };
  const noteFrame = (frame) => {
    let eventType = "";
    const dataLines = [];
    for (const rawLine of frame.split(/\r?\n/)) {
      const line = rawLine.trimStart();
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) return;
    try {
      const parsed = JSON.parse(dataLines.join("\n"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const payload = parsed;
      notePayload(payload, typeof payload.type === "string" ? payload.type : eventType);
    } catch {
    }
  };
  return {
    note(text) {
      if (completed) return true;
      buffer += text;
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        noteFrame(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
      if (buffer.length > 65536) buffer = buffer.slice(-65536);
      return completed;
    }
  };
}
export {
  createCompletedResponsesToolHandoffWatcher
};
