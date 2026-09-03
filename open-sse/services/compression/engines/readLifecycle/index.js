import { createCompressionStats } from "../../stats.js";
const ENGINE_ID = "read-lifecycle";
const READ_NAMES = /* @__PURE__ */ new Set(["read", "read_file", "readfile", "view", "view_file", "cat"]);
const WRITE_NAMES = /* @__PURE__ */ new Set([
  "write",
  "write_file",
  "writefile",
  "edit",
  "edit_file",
  "multiedit",
  "str_replace",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "apply_patch",
  "create_file",
  "update_file"
]);
function classifyTool(name) {
  if (typeof name !== "string") return null;
  const lc = name.trim().toLowerCase();
  if (READ_NAMES.has(lc)) return "read";
  if (WRITE_NAMES.has(lc)) return "write";
  return null;
}
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function extractPath(input) {
  if (!isRecord(input)) return null;
  for (const key of ["file_path", "path", "filePath", "filename", "file", "target_file"]) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
function parseMaybeJson(value) {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}
function extractInvocations(messages) {
  const invocations = [];
  const readPathByCallId = /* @__PURE__ */ new Map();
  let order = 0;
  for (const msg of messages) {
    if (Array.isArray(msg?.content)) {
      for (const block of msg.content) {
        if (!isRecord(block) || block.type !== "tool_use") continue;
        const kind = classifyTool(block.name);
        const callId = typeof block.id === "string" ? block.id : null;
        const path = extractPath(block.input);
        if (kind && callId && path) {
          invocations.push({ callId, kind, path, order: order++ });
          if (kind === "read") readPathByCallId.set(callId, path);
        }
      }
    }
    if (Array.isArray(msg?.tool_calls)) {
      for (const call of msg.tool_calls) {
        if (!isRecord(call)) continue;
        const fn = isRecord(call.function) ? call.function : null;
        const kind = classifyTool(fn?.name);
        const callId = typeof call.id === "string" ? call.id : null;
        const path = extractPath(parseMaybeJson(fn?.arguments));
        if (kind && callId && path) {
          invocations.push({ callId, kind, path, order: order++ });
          if (kind === "read") readPathByCallId.set(callId, path);
        }
      }
    }
  }
  return { invocations, readPathByCallId };
}
function findSupersededReadCallIds(invocations) {
  const superseded = /* @__PURE__ */ new Set();
  for (const inv of invocations) {
    if (inv.kind !== "read") continue;
    const hasLater = invocations.some((o) => o.path === inv.path && o.order > inv.order);
    if (hasLater) superseded.add(inv.callId);
  }
  return superseded;
}
function stubFor(path) {
  return `[read superseded \u2014 "${path}" was re-read or modified later in the conversation; the current content appears below]`;
}
function replaceResultText(content, stub) {
  if (typeof content === "string") return stub;
  if (Array.isArray(content)) {
    return content.map(
      (part) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? { ...part, text: stub } : part
    );
  }
  return stub;
}
function collapseSupersededReads(messages, superseded, readPathByCallId) {
  if (superseded.size === 0) return { messages, collapsedCount: 0 };
  let collapsedCount = 0;
  const out = messages.map((msg) => {
    if (msg?.role === "tool" && typeof msg.tool_call_id === "string" && superseded.has(msg.tool_call_id)) {
      collapsedCount++;
      const path = readPathByCallId.get(msg.tool_call_id) ?? "file";
      return { ...msg, content: stubFor(path) };
    }
    if (Array.isArray(msg?.content)) {
      let changed = false;
      const newContent = msg.content.map((block) => {
        if (isRecord(block) && block.type === "tool_result" && typeof block.tool_use_id === "string" && superseded.has(block.tool_use_id)) {
          changed = true;
          collapsedCount++;
          const path = readPathByCallId.get(block.tool_use_id) ?? "file";
          return { ...block, content: replaceResultText(block.content, stubFor(path)) };
        }
        return block;
      });
      if (changed) return { ...msg, content: newContent };
    }
    return msg;
  });
  return { messages: out, collapsedCount };
}
const SCHEMA = [
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: false }
];
function validate(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  return { valid: errors.length === 0, errors };
}
const readLifecycleEngine = {
  id: ENGINE_ID,
  name: "Read Lifecycle (opt-in)",
  description: "Collapses stale/superseded file-Read tool results: when the same path is re-read or modified later in the conversation, earlier Reads are replaced with a short stub, keeping the current Read intact. Lossy + opt-in (default off). Supports Anthropic and OpenAI tool shapes.",
  icon: "history",
  targets: ["messages"],
  stackable: true,
  // Runs early (before content engines) so stale reads are gone before other passes work on them.
  stackPriority: 5,
  metadata: {
    id: ENGINE_ID,
    name: "Read Lifecycle (opt-in)",
    description: "Collapse superseded file-Read tool results (same path re-read/modified later). Lossy, opt-in, default off. Anthropic + OpenAI shapes.",
    inputScope: "messages",
    targetLatencyMs: 2,
    supportsPreview: true,
    stable: true
  },
  apply(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] !== true) {
      return { body, compressed: false, stats: null };
    }
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    try {
      const start = performance.now();
      const { invocations, readPathByCallId } = extractInvocations(messages);
      const superseded = findSupersededReadCallIds(invocations);
      const { messages: newMessages, collapsedCount } = collapseSupersededReads(
        messages,
        superseded,
        readPathByCallId
      );
      if (collapsedCount === 0) {
        return { body, compressed: false, stats: null };
      }
      const newBody = { ...body, messages: newMessages };
      const durationMs = Math.round(performance.now() - start);
      const stats = createCompressionStats(
        body,
        newBody,
        "stacked",
        [ENGINE_ID],
        [`read-lifecycle-collapsed-${collapsedCount}`],
        durationMs
      );
      return { body: newBody, compressed: true, stats };
    } catch {
      return { body, compressed: false, stats: null };
    }
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return SCHEMA;
  },
  validateConfig(config) {
    return validate(config);
  }
};
export {
  collapseSupersededReads,
  extractInvocations,
  findSupersededReadCallIds,
  readLifecycleEngine
};
