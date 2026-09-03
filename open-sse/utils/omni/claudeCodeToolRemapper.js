import { EXTRA_TOOL_RENAME_MAP } from "./claudeCodeExtraRemap.js";
const TOOL_RENAME_MAP = {
  ...EXTRA_TOOL_RENAME_MAP,
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  task: "Task",
  agent: "Agent",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  todowrite: "TodoWrite",
  todoread: "TodoRead",
  question: "Question",
  askuserquestion: "AskUserQuestion",
  skill: "Skill",
  slashcommand: "SlashCommand",
  multiedit: "MultiEdit",
  notebook: "Notebook",
  notebookedit: "NotebookEdit",
  notebookread: "NotebookRead",
  lsp: "Lsp",
  apply_patch: "ApplyPatch",
  applypatch: "ApplyPatch",
  bashoutput: "BashOutput",
  killshell: "KillShell",
  killbash: "KillBash",
  enterplanmode: "EnterPlanMode",
  exitplanmode: "ExitPlanMode",
  enterworktree: "EnterWorktree",
  exitworktree: "ExitWorktree",
  artifact: "Artifact",
  designsync: "DesignSync",
  monitor: "Monitor",
  sendmessage: "SendMessage",
  listagents: "ListAgents",
  pushnotification: "PushNotification",
  reportfindings: "ReportFindings",
  schedulewakeup: "ScheduleWakeup",
  croncreate: "CronCreate",
  crondelete: "CronDelete",
  cronlist: "CronList",
  taskoutput: "TaskOutput",
  taskstop: "TaskStop",
  taskcreate: "TaskCreate",
  taskupdate: "TaskUpdate",
  tasklist: "TaskList",
  taskget: "TaskGet",
  workflow: "Workflow"
};
const REVERSE_MAP = {};
for (const [k, v] of Object.entries(TOOL_RENAME_MAP)) {
  REVERSE_MAP[v] = k;
}
function getRequestToolNameMap(body) {
  const existing = body._toolNameMap instanceof Map ? body._toolNameMap : /* @__PURE__ */ new Map();
  Object.defineProperty(body, "_toolNameMap", {
    value: existing,
    enumerable: false,
    configurable: true,
    writable: true
  });
  return existing;
}
function trackToolName(body, titleCaseName, originalName) {
  getRequestToolNameMap(body).set(titleCaseName, originalName);
}
function collectServerToolNames(tools) {
  const names = /* @__PURE__ */ new Set();
  if (!Array.isArray(tools)) return names;
  for (const tool of tools) {
    const t = tool;
    if (t && isAnthropicServerToolType(t.type) && typeof t.name === "string") {
      names.add(t.name);
    }
  }
  return names;
}
function remapToolNamesInRequest(body) {
  let hasLowercase = false;
  let hasTitleCase = false;
  const serverToolNames = collectServerToolNames(body.tools);
  const tools = body.tools;
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (!tool) continue;
      if (isAnthropicServerToolType(tool.type)) continue;
      const name = String(tool.name || "");
      if (TOOL_RENAME_MAP[name]) {
        const mapped = TOOL_RENAME_MAP[name];
        tool.name = mapped;
        trackToolName(body, mapped, name);
        hasLowercase = true;
      } else if (REVERSE_MAP[name]) {
        hasTitleCase = true;
      }
    }
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === "tool_use" && typeof block.name === "string") {
          if (serverToolNames.has(block.name)) continue;
          const mapped = TOOL_RENAME_MAP[block.name];
          if (mapped) {
            const originalName = block.name;
            block.name = mapped;
            trackToolName(body, mapped, originalName);
            hasLowercase = true;
          } else if (REVERSE_MAP[block.name]) {
            hasTitleCase = true;
          }
        }
      }
    }
  }
  const toolChoice = body.tool_choice;
  if (toolChoice?.type === "tool" && typeof toolChoice.name === "string" && !serverToolNames.has(toolChoice.name)) {
    const mapped = TOOL_RENAME_MAP[toolChoice.name];
    if (mapped) {
      const originalName = toolChoice.name;
      toolChoice.name = mapped;
      trackToolName(body, mapped, originalName);
      hasLowercase = true;
    } else if (REVERSE_MAP[toolChoice.name]) {
      hasTitleCase = true;
    }
  }
  return hasLowercase && !hasTitleCase;
}
function remapToolNamesInResponse(text, forceLowercase = true, toolNameMap) {
  if (!forceLowercase) return text;
  if (toolNameMap?.size) {
    for (const [mapped, original] of toolNameMap.entries()) {
      text = text.replaceAll(`"name":"${mapped}"`, `"name":"${original}"`);
      text = text.replaceAll(`"name": "${mapped}"`, `"name": "${original}"`);
    }
  }
  for (const [titleCase, lower] of Object.entries(REVERSE_MAP)) {
    text = text.replaceAll(`"name":"${titleCase}"`, `"name":"${lower}"`);
    text = text.replaceAll(`"name": "${titleCase}"`, `"name": "${lower}"`);
  }
  return text;
}
function restoreClaudeToolName(rawName, toolNameMap) {
  if (!rawName) return rawName;
  const lower = rawName.toLowerCase();
  const canonicalRaw = TOOL_RENAME_MAP[lower];
  const canonical = canonicalRaw && canonicalRaw !== rawName ? canonicalRaw : void 0;
  if (toolNameMap?.size) {
    const exact = toolNameMap.get(rawName);
    if (typeof exact === "string" && (exact !== rawName || !canonical)) {
      return exact;
    }
    let identityMatch;
    for (const [sanitized, original] of toolNameMap.entries()) {
      if (sanitized.toLowerCase() !== lower && original.toLowerCase() !== lower) {
        continue;
      }
      if (original !== rawName) {
        return original;
      }
      identityMatch = original;
    }
    if (identityMatch !== void 0 && !canonical) {
      return identityMatch;
    }
  }
  if (canonicalRaw === rawName) return rawName;
  if (canonical) return canonical;
  if (!toolNameMap && REVERSE_MAP[rawName]) {
    return REVERSE_MAP[rawName];
  }
  return REVERSE_MAP[rawName] ?? rawName;
}
const CLAUDE_BUILTIN_TOOL_NAMES = new Set(Object.values(TOOL_RENAME_MAP));
const HARNESS_CANONICAL_MAP = {
  read_file: "Read",
  write_file: "Write",
  search_files: "Grep",
  grep_search: "Grep",
  list_directory: "Glob",
  run_command: "Bash",
  terminal: "Bash",
  todo: "TodoWrite",
  todo_write: "TodoWrite",
  todo_read: "TodoRead",
  patch: "Edit",
  multi_edit: "MultiEdit"
};
function toPascalCaseToolName(name) {
  const parts = name.split(/[_\s-]+/).filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return pascal || name;
}
function needsThirdPartyCloak(name) {
  if (!name) return false;
  if (CLAUDE_BUILTIN_TOOL_NAMES.has(name)) return false;
  if (name.startsWith("mcp__")) return false;
  return /[a-z]/.test(name.charAt(0)) || name.includes("_") || name.includes("-");
}
const VERSIONED_SERVER_TOOL_TYPE = /^[a-z][a-z0-9_]*_\d{8}$/;
const NON_VERSIONED_SERVER_TOOL_TYPES = /* @__PURE__ */ new Set(["web_search", "web_search_preview"]);
function isAnthropicServerToolType(type) {
  if (typeof type !== "string" || type.length === 0) return false;
  return VERSIONED_SERVER_TOOL_TYPE.test(type) || NON_VERSIONED_SERVER_TOOL_TYPES.has(type);
}
function cloakThirdPartyToolNames(body, options) {
  if (process.env.CLAUDE_DISABLE_TOOL_NAME_CLOAK === "true") {
    return /* @__PURE__ */ new Map();
  }
  const shouldCloak = (name) => needsThirdPartyCloak(name) && !(options?.skip ? options.skip(name) : false);
  const tools = body.tools;
  const serverToolNames = collectServerToolNames(tools);
  const used = /* @__PURE__ */ new Set();
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (tool && typeof tool.name === "string") used.add(tool.name);
    }
  }
  const existingMap = body._toolNameMap instanceof Map ? body._toolNameMap : null;
  if (existingMap) {
    for (const alias of existingMap.keys()) used.add(alias);
  }
  let nameMap = existingMap;
  const assigned = /* @__PURE__ */ new Map();
  const aliasFor = (original) => {
    const existing = assigned.get(original);
    if (existing) return existing;
    const base = TOOL_RENAME_MAP[original] ?? HARNESS_CANONICAL_MAP[original] ?? toPascalCaseToolName(original);
    let alias = base;
    let suffix = 2;
    while (alias !== original && used.has(alias)) {
      alias = `${base}${suffix++}`;
    }
    used.delete(original);
    used.add(alias);
    assigned.set(original, alias);
    if (!nameMap) nameMap = getRequestToolNameMap(body);
    nameMap.set(alias, original);
    return alias;
  };
  if (Array.isArray(tools)) {
    body.tools = tools.map((tool) => {
      if (tool && isAnthropicServerToolType(tool.type)) {
        return tool;
      }
      if (tool && typeof tool.name === "string" && shouldCloak(tool.name)) {
        return { ...tool, name: aliasFor(tool.name) };
      }
      return tool;
    });
  }
  const messages = body.messages;
  if (Array.isArray(messages)) {
    body.messages = messages.map((message) => {
      const content = message?.content;
      if (!Array.isArray(content)) return message;
      let changed = false;
      const newContent = content.map((block) => {
        if (block?.type === "tool_use" && typeof block.name === "string" && !serverToolNames.has(block.name) && shouldCloak(block.name)) {
          changed = true;
          return { ...block, name: aliasFor(block.name) };
        }
        return block;
      });
      return changed ? { ...message, content: newContent } : message;
    });
  }
  const toolChoice = body.tool_choice;
  if (toolChoice?.type === "tool" && typeof toolChoice.name === "string" && !serverToolNames.has(toolChoice.name) && shouldCloak(toolChoice.name)) {
    body.tool_choice = { ...toolChoice, name: aliasFor(toolChoice.name) };
  }
  return nameMap ?? /* @__PURE__ */ new Map();
}
export {
  REVERSE_MAP,
  TOOL_RENAME_MAP,
  cloakThirdPartyToolNames,
  isAnthropicServerToolType,
  needsThirdPartyCloak,
  remapToolNamesInRequest,
  remapToolNamesInResponse,
  restoreClaudeToolName
};
