import {
  parseToolCallsFromText,
  parseLooseJsonObject,
  getRequestedToolNames,
  resolveRequestedToolName,
  toArgumentsString,
  stripRanges,
  getToolNonce
} from "./webTools.js";
function serializeDeepSeekToolPrompt(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return "";
  const nonce = getToolNonce(tools);
  if (!nonce) return "";
  const lines = [];
  for (const t of tools) {
    const fn = t?.function;
    if (!fn?.name) continue;
    const desc = typeof fn.description === "string" && fn.description ? fn.description : "";
    let params = "";
    try {
      params = fn.parameters ? JSON.stringify(fn.parameters) : "";
    } catch {
      params = "";
    }
    lines.push(
      `- ${fn.name}${desc ? `: ${desc}` : ""}${params ? `
  parameters: ${params}` : ""}`
    );
  }
  if (lines.length === 0) return "";
  return [
    "You can call tools. To call a tool, output ONLY this exact block (no markdown fence):",
    `<tool>{"name": "<tool_name>", "arguments": { ... }, "_nonce": "${nonce}"}</tool>`,
    "Rules:",
    "- Use exactly <tool>...</tool>. Do NOT use <tool:name>, <tool_call>, <name>, <parameter>, id=/name= attributes, or code fences.",
    `- Include the secret binding "_nonce": "${nonce}" exactly as shown.`,
    '- "name" must be one of the tools below; "arguments" must be a JSON object.',
    "- When a tool is needed, emit the <tool> block instead of only describing the plan.",
    "- Emit one <tool> block per call; you may put several blocks back to back.",
    "- If no tool is needed, just answer normally without any <tool> block.",
    "",
    "Available tools:",
    ...lines
  ].join("\n");
}
function extractText(content) {
  if (Array.isArray(content)) {
    return content.filter((item) => item?.type === "text").map((item) => item?.text ?? "").join("\n");
  }
  return content == null ? "" : String(content);
}
function buildToolConversationPrompt(messages, toolSystemPrompt) {
  const systemParts = [];
  if (toolSystemPrompt) systemParts.push(toolSystemPrompt);
  const lines = [];
  const callNameById = /* @__PURE__ */ new Map();
  let sawToolActivity = false;
  for (const m of messages) {
    if (m.role === "system") {
      const t = extractText(m.content).trim();
      if (t) systemParts.push(t);
    } else if (m.role === "user") {
      const t = extractText(m.content).trim();
      if (t) lines.push(`User: ${t}`);
    } else if (m.role === "assistant") {
      const t = extractText(m.content).trim();
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      const parts2 = [];
      if (t) parts2.push(t);
      for (const c of calls) {
        const name = typeof c?.function?.name === "string" ? c.function.name : "";
        const rawArgs = c?.function?.arguments;
        const args = typeof rawArgs === "string" && rawArgs ? rawArgs : JSON.stringify(rawArgs ?? {});
        if (c?.id) callNameById.set(c.id, name);
        parts2.push(`<tool>{"name": ${JSON.stringify(name)}, "arguments": ${args}}</tool>`);
        sawToolActivity = true;
      }
      if (parts2.length) lines.push(`Assistant: ${parts2.join("\n")}`);
    } else if (m.role === "tool") {
      const t = extractText(m.content).trim();
      const name = m.tool_call_id && callNameById.get(m.tool_call_id) || m.name || "tool";
      lines.push(`Tool result (${name}): ${t || "(no output)"}`);
      sawToolActivity = true;
    }
  }
  const parts = [];
  if (systemParts.length) parts.push(systemParts.join("\n\n"));
  if (lines.length) parts.push(lines.join("\n\n"));
  if (sawToolActivity) {
    parts.push(
      "Continue the task using the tool results above. Do NOT repeat tool calls that already succeeded; perform the next step or give the final answer."
    );
  }
  return parts.join("\n\n").replace(/!\[.*?\]\(.*?\)/g, "");
}
const TAG_TOKEN_RE = /<(\/?)(?:tool_call|tool)(:[A-Za-z0-9_.+-]+)?((?:\s[^>]*)?)\/?>/g;
function tokenizeToolTags(text) {
  const tokens = [];
  let m;
  TAG_TOKEN_RE.lastIndex = 0;
  while ((m = TAG_TOKEN_RE.exec(text)) !== null) {
    tokens.push({
      start: m.index,
      end: TAG_TOKEN_RE.lastIndex,
      closing: m[1] === "/",
      suffix: m[2] ? m[2].slice(1) : "",
      attrs: m[3] || ""
    });
  }
  return tokens;
}
function pairToolBlocks(tokens, textLen) {
  const blocks = [];
  const stack = [];
  for (const tok of tokens) {
    if (!tok.closing) {
      stack.push(tok);
      continue;
    }
    const open = stack.pop();
    if (!open) continue;
    blocks.push({ open, close: tok, innerStart: open.end, innerEnd: tok.start });
  }
  for (const open of stack) {
    const synthetic = {
      start: textLen,
      end: textLen,
      closing: true,
      suffix: "",
      attrs: ""
    };
    blocks.push({ open, close: synthetic, innerStart: open.end, innerEnd: textLen });
  }
  return blocks;
}
function getAttr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("|')`);
  const m = re.exec(attrs);
  if (!m) return null;
  const quote = m[1];
  let j = m.index + m[0].length;
  let out = "";
  while (j < attrs.length) {
    const ch = attrs[j];
    if (ch === "\\") {
      out += attrs[j + 1] ?? "";
      j += 2;
      continue;
    }
    if (ch === quote) break;
    out += ch;
    j += 1;
  }
  return out;
}
function getXmlChild(inner, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(inner);
  return m ? m[1].trim() : null;
}
const PARAM_TAG_RE = /<parameter\b([^>]*?)\/?>(?:((?:(?!<parameter\b)[\s\S])*?)<\/parameter>)?/gi;
function buildArgsFromParameters(inner) {
  const out = {};
  let found = false;
  let m;
  PARAM_TAG_RE.lastIndex = 0;
  while ((m = PARAM_TAG_RE.exec(inner)) !== null) {
    const attrs = m[1] || "";
    const body = m[2];
    const name = getAttr(attrs, "name");
    if (!name) continue;
    const value = getAttr(attrs, "content") ?? (typeof body === "string" ? body.trim() : "");
    out[name] = value;
    found = true;
  }
  return found ? out : null;
}
function asString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function buildSchemaParamMap(requestedTools) {
  const map = /* @__PURE__ */ new Map();
  if (!Array.isArray(requestedTools)) return map;
  for (const tool of requestedTools) {
    const fn = tool?.function;
    if (!fn?.name) continue;
    const params = fn.parameters;
    const props = params?.properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      map.set(fn.name, new Set(Object.keys(props)));
    } else {
      map.set(fn.name, /* @__PURE__ */ new Set());
    }
  }
  return map;
}
function extractCall(tagName, innerRaw, requested, schemaMap) {
  const inner = innerRaw.trim();
  const nameChild = getXmlChild(inner, "name");
  const argsChild = getXmlChild(inner, "arguments") ?? getXmlChild(inner, "parameters");
  const paramObj = argsChild ? null : buildArgsFromParameters(inner);
  const hasXmlChildren = !!nameChild || !!argsChild || !!paramObj;
  const json = hasXmlChildren ? null : parseLooseJsonObject(inner);
  const jsonName = json ? asString(json.name) ?? asString(json.type) : null;
  const childResolved = nameChild ? resolveRequestedToolName(nameChild, requested) : null;
  const jsonResolved = jsonName ? resolveRequestedToolName(jsonName, requested) : null;
  const tagResolved = tagName ? resolveRequestedToolName(tagName, requested) : null;
  let name = null;
  let nameFromTag = false;
  const pick = (val, fromTag) => {
    if (!name && val) {
      name = val;
      nameFromTag = fromTag;
    }
  };
  pick(childResolved, false);
  pick(jsonResolved, false);
  pick(tagResolved, true);
  pick(nameChild, false);
  pick(jsonName, false);
  pick(tagName, true);
  if (!name && !tagName && json) {
    const command = asString(json.command);
    const resolved = command ? resolveRequestedToolName(command, requested) : null;
    if (resolved) {
      name = resolved;
      nameFromTag = false;
    }
  }
  if (!name && paramObj && schemaMap && schemaMap.size > 0) {
    const extractedKeys = Object.keys(paramObj);
    if (extractedKeys.length > 0) {
      const candidates = [];
      for (const [toolName, schemaKeys] of schemaMap) {
        if (schemaKeys.size > 0 && extractedKeys.every((k) => schemaKeys.has(k))) {
          candidates.push(toolName);
        }
      }
      if (candidates.length === 1) {
        name = candidates[0];
        nameFromTag = false;
      }
    }
  }
  if (!name) return null;
  let argsValue;
  if (argsChild) {
    argsValue = parseLooseJsonObject(argsChild) ?? argsChild;
  } else if (paramObj) {
    argsValue = paramObj;
  } else if (json) {
    if (json.arguments !== void 0) argsValue = json.arguments;
    else if (json.params !== void 0) argsValue = json.params;
    else if (nameFromTag) {
      argsValue = json;
    } else {
      const { name: _n, type: _t, id: _i, command: _c, arguments: _a, params: _p, ...rest } = json;
      argsValue = rest;
    }
  } else {
    argsValue = {};
  }
  return { name, arguments: toArgumentsString(argsValue) };
}
function parseDeepSeekToolCalls(text, idSeed = "call", requestedTools) {
  if (typeof text !== "string" || text.length === 0) {
    return { content: text ?? "", toolCalls: null };
  }
  const tokens = tokenizeToolTags(text);
  if (tokens.length === 0) {
    return parseToolCallsFromText(text, idSeed, requestedTools);
  }
  const requested = getRequestedToolNames(requestedTools);
  const schemaMap = buildSchemaParamMap(requestedTools);
  const blocks = pairToolBlocks(tokens, text.length);
  const isLeaf = (b) => !blocks.some((o) => o !== b && o.open.start >= b.innerStart && o.close.end <= b.innerEnd);
  const toolCalls = [];
  const acceptedRanges = [];
  const nonce = getToolNonce(requestedTools);
  for (const block of blocks.filter(isLeaf).sort((a, b) => a.open.start - b.open.start)) {
    const tagName = block.open.suffix || getAttr(block.open.attrs, "name") || getAttr(block.open.attrs, "id") || "";
    const inner = text.slice(block.innerStart, block.innerEnd);
    const call = extractCall(tagName, inner, requested, schemaMap);
    if (!call) continue;
    if (nonce) {
      const parsed = parseLooseJsonObject(inner);
      if (parsed && typeof parsed.name === "string" && parsed._nonce !== void 0 && parsed._nonce !== nonce) continue;
    }
    toolCalls.push({
      id: `${idSeed}_${toolCalls.length}`,
      type: "function",
      function: { name: call.name, arguments: call.arguments }
    });
    acceptedRanges.push({ start: block.open.start, end: block.close.end });
  }
  if (toolCalls.length === 0) {
    return { content: text, toolCalls: null };
  }
  const within = (tok) => acceptedRanges.some((r) => tok.start >= r.start && tok.end <= r.end);
  const ranges = [
    ...acceptedRanges,
    ...tokens.filter((t) => !within(t)).map((t) => ({ start: t.start, end: t.end }))
  ];
  return { content: stripRanges(text, ranges), toolCalls };
}
export {
  buildToolConversationPrompt,
  parseDeepSeekToolCalls,
  serializeDeepSeekToolPrompt
};
