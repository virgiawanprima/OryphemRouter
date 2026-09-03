function sanitizeNotionAssistantText(text) {
  if (!text) return "";
  let clean = text.replace(/^\uFEFF/, "").trim();
  clean = clean.replace(/<\/?lang\b[^>]*\/?>/gi, "");
  clean = clean.replace(/<\/lang>/gi, "");
  if (/^<lang\b/i.test(clean) && !clean.includes(">")) return "";
  return clean.trim();
}
function extractRichText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "").join("");
}
function extractAgentInferenceText(value) {
  if (!Array.isArray(value)) return "";
  const parts = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const part = item;
    const t = typeof part.type === "string" ? part.type.toLowerCase() : "";
    if (t === "text" && typeof part.content === "string" && part.content) {
      parts.push(part.content);
    }
  }
  return parts.join("");
}
function extractThreadMessageStep(msg) {
  if (!msg || typeof msg !== "object") return null;
  const valueWrapper = msg.value;
  if (!valueWrapper || typeof valueWrapper !== "object") return null;
  const inner = valueWrapper.value;
  if (!inner || typeof inner !== "object") return null;
  const step = inner.step;
  if (!step || typeof step !== "object") return null;
  return step;
}
function extractStepText(stepObj) {
  const stepType = typeof stepObj.type === "string" ? stepObj.type : "";
  if (stepType === "agent-inference") {
    return extractAgentInferenceText(stepObj.value);
  }
  if (stepType === "markdown-chat" && typeof stepObj.value === "string") {
    return stepObj.value;
  }
  return "";
}
function extractFromRecordMap(recordMap) {
  if (!recordMap || typeof recordMap !== "object" || Array.isArray(recordMap)) return "";
  const tm = recordMap.thread_message;
  if (!tm || typeof tm !== "object" || Array.isArray(tm)) return "";
  let best = "";
  for (const msg of Object.values(tm)) {
    const stepObj = extractThreadMessageStep(msg);
    if (!stepObj) continue;
    const text = extractStepText(stepObj);
    if (text && text.length >= best.length) best = text;
  }
  return best;
}
function applyNotionValuePartAppend(v, state) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return;
  const part = v;
  if (part.type === "text" && typeof part.content === "string" && part.content) {
    state.lastPatchFinal = part.content;
  }
  if (part.type === "markdown-chat" && typeof part.value === "string" && part.value) {
    state.lastPatchFinal = part.value;
  }
}
function applyNotionStepAppend(v, state) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return;
  const step = v;
  if (step.type === "markdown-chat" && typeof step.value === "string" && step.value) {
    state.lastPatchFinal = step.value;
  }
  if (step.type === "agent-inference") {
    const text = extractAgentInferenceText(step.value);
    if (text) state.lastPatchFinal = text;
  }
}
function applyNotionPatchOp(rawOp, state) {
  if (!rawOp || typeof rawOp !== "object") return;
  const op = rawOp;
  const o = typeof op.o === "string" ? op.o : "";
  const p = typeof op.p === "string" ? op.p : "";
  const v = op.v;
  if (o === "a" && p.endsWith("/value/-")) {
    applyNotionValuePartAppend(v, state);
  } else if (o === "a" && p.endsWith("/s/-")) {
    applyNotionStepAppend(v, state);
  } else if ((o === "x" || o === "p") && p.includes("/value") && typeof v === "string" && v) {
    state.lastIncremental += v;
  }
}
function applyNotionStreamRecord(rec, state) {
  const type = typeof rec.type === "string" ? rec.type : "";
  if (type === "markdown-chat" && typeof rec.value === "string" && rec.value) {
    state.lastPatchFinal = rec.value;
    return;
  }
  if (type === "agent-inference") {
    const text = extractAgentInferenceText(rec.value);
    if (text) state.lastPatchFinal = text;
    return;
  }
  if (type === "patch" && Array.isArray(rec.v)) {
    for (const rawOp of rec.v) applyNotionPatchOp(rawOp, state);
    return;
  }
  if (type === "record-map" || rec.recordMap) {
    const text = extractFromRecordMap(rec.recordMap || rec);
    if (text) state.lastRecordMap = text;
    return;
  }
  const rich = extractRichText(rec.value);
  if (rich) state.lastLegacy = rich;
}
function applyNotionStreamLine(rawLine, state) {
  const line = rawLine.trim();
  if (!line || line === "[DONE]") return;
  const payloadLine = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (!payloadLine) return;
  let record;
  try {
    record = JSON.parse(payloadLine);
  } catch {
    return;
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  applyNotionStreamRecord(record, state);
}
function parseNotionInferenceStream(raw) {
  if (!raw) return "";
  const state = {
    lastLegacy: "",
    lastPatchFinal: "",
    lastIncremental: "",
    lastRecordMap: ""
  };
  for (const rawLine of raw.split("\n")) {
    applyNotionStreamLine(rawLine, state);
  }
  const candidates = [
    state.lastRecordMap,
    state.lastPatchFinal,
    state.lastIncremental,
    state.lastLegacy
  ].map(sanitizeNotionAssistantText).filter(Boolean);
  return candidates.sort((a, b) => b.length - a.length)[0] || "";
}
function extractNotionUpstreamError(raw) {
  if (!raw || !raw.trim()) return null;
  const tryParse = (s) => {
    try {
      const o = JSON.parse(s);
      return o && typeof o === "object" ? o : null;
    } catch {
      return null;
    }
  };
  const candidates = [];
  const whole = tryParse(raw.trim());
  if (whole) candidates.push(whole);
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const o = tryParse(t);
    if (o) candidates.push(o);
  }
  const flat = [];
  const pushNested = (o) => {
    flat.push(o);
    const data = o.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const s = data.s;
      if (Array.isArray(s)) {
        for (const item of s) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            flat.push(item);
          }
        }
      }
    }
    if (Array.isArray(o.s)) {
      for (const item of o.s) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          flat.push(item);
        }
      }
    }
  };
  for (const o of candidates) pushNested(o);
  for (const o of flat) {
    const type = typeof o.type === "string" ? o.type.toLowerCase() : "";
    const subType = typeof o.subType === "string" ? o.subType : void 0;
    const message = typeof o.message === "string" && o.message || typeof o.error === "string" && o.error || "";
    const isError = type === "error" || Boolean(subType) || typeof o.isRetryable === "boolean" && message.toLowerCase().includes("went wrong");
    if (!isError && !subType) continue;
    const sub = (subType || "").toLowerCase();
    const retryable = o.isRetryable === true || sub.includes("temporarily") || sub.includes("unavailable") || sub.includes("rate") || sub.includes("timeout") || sub.includes("overloaded");
    return {
      message: message || subType || "Notion upstream error",
      subType,
      isRetryable: retryable
    };
  }
  return null;
}
export {
  extractNotionUpstreamError,
  parseNotionInferenceStream,
  sanitizeNotionAssistantText
};
