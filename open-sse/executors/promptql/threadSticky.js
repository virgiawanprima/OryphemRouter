import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { extractMessageTextFromMessage, isUserLikeRole } from "./messageText.js";
function readStr(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length ? t : "";
}
const memoryThreads = /* @__PURE__ */ new Map();
const THREAD_CACHE_MAX = 200;
function threadCachePath() {
  const dataDir = process.env.DATA_DIR || process.env.OMNIROUTE_DATA_DIR;
  if (!dataDir) return null;
  return join(dataDir, "promptql-thread-sessions.json");
}
async function loadThreadDisk() {
  const p = threadCachePath();
  if (!p || !(await access(p).then(() => true).catch(() => false))) return {};
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return {};
  }
}
async function saveThreadDisk(map) {
  const p = threadCachePath();
  if (!p) return;
  try {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(map), "utf8");
  } catch {
  }
}
function isFingerprintRole(role) {
  const r = (role || "").toLowerCase();
  if (!r || r === "system" || r === "developer") return false;
  return true;
}
function normalizeForFingerprint(text) {
  let t = (text || "").replace(/\r\n/g, "\n");
  t = t.replace(/<agent_mention\s*\/>/gi, "");
  t = t.replace(/<\/?agent_mention>/gi, "");
  t = t.replace(/^@\S+\s+/gm, "");
  t = t.replace(/^[\s\S]*?\bUser request:\s*/i, "");
  t = t.replace(/^[\s\S]*?\bHere is my request:\s*/i, "");
  t = t.replace(/^[\s\S]*?\bCurrent request:\s*/i, "");
  t = t.replace(/^[\s\S]*?\bMy current task:\s*/i, "");
  t = t.replace(
    /^Here is data returned by my desktop application[\s\S]*?(?:\n\n|$)/i,
    ""
  );
  t = t.replace(
    /^Here is the output from my local tool[\s\S]*?(?:\n\n|$)/i,
    ""
  );
  t = t.replace(
    /\n\nBased on this result[\s\S]*$/i,
    ""
  );
  t = t.replace(
    /\n\n(?:Please |If a structured)[\s\S]*$/i,
    ""
  );
  if (/interoperability layer between PromptQL/i.test(t)) {
    const m = t.match(/\bCurrent request:\s*([\s\S]+)$/i);
    if (m) t = m[1];
  }
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim().slice(0, 2e3);
}
function extractToolNameSignature(text) {
  if (!text) return "";
  const names = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/"tool"\s*:\s*"([^"]+)"/g)) names.add(m[1].toLowerCase());
  for (const m of text.matchAll(/tool_call:([A-Za-z0-9_.-]+):/g)) names.add(m[1].toLowerCase());
  for (const m of text.matchAll(/function_call:([A-Za-z0-9_.-]+):/g)) names.add(m[1].toLowerCase());
  for (const m of text.matchAll(/\[tool result for\s+([^\]]+)\]/gi)) {
    names.add(m[1].trim().toLowerCase());
  }
  return [...names].sort().join(",");
}
function conversationFingerprint(projectId, messages) {
  const parts = [`project:${projectId}`];
  for (const m of messages) {
    const roleRaw = (m?.role || "").toLowerCase();
    if (!isFingerprintRole(roleRaw)) continue;
    const role = roleRaw === "tool" || roleRaw === "function" || roleRaw === "human" ? "user" : roleRaw;
    const text = normalizeForFingerprint(extractMessageTextFromMessage(m));
    if (!text) continue;
    parts.push(`${role}:${text}`);
  }
  const h = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
  return `pql:${projectId}:${h}`;
}
function lastAssistantStickyKeys(projectId, messages) {
  const keys = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    keys.push(k);
  };
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role !== "assistant" && role !== "ai" && role !== "model") continue;
    const raw = extractMessageTextFromMessage(messages[i]);
    const text = normalizeForFingerprint(raw);
    if (text) {
      const h = createHash("sha256").update(text).digest("hex").slice(0, 24);
      push(`pql:${projectId}:asst:${h}`);
    }
    const tools = extractToolNameSignature(raw);
    if (tools) {
      const h = createHash("sha256").update(tools).digest("hex").slice(0, 16);
      push(`pql:${projectId}:tools:${h}`);
    }
    break;
  }
  return keys;
}
function lastAssistantFingerprint(projectId, messages) {
  return lastAssistantStickyKeys(projectId, messages)[0] ?? null;
}
function historyPrefixBeforeLastUser(messages) {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isUserLikeRole(messages[i]?.role || "")) {
      lastUser = i;
      break;
    }
  }
  if (lastUser <= 0) return [];
  return messages.slice(0, lastUser);
}
function hasAssistantMessage(messages) {
  return messages.some((m) => {
    const r = (m?.role || "").toLowerCase();
    if (r === "assistant" || r === "ai" || r === "model") return true;
    return false;
  });
}
async function getThreadBinding(key) {
  if (!key) return null;
  const mem = memoryThreads.get(key);
  if (mem) return mem;
  const disk = await loadThreadDisk();
  const cached = disk[key];
  if (cached) {
    memoryThreads.set(key, cached);
    return cached;
  }
  return null;
}
async function setThreadBinding(key, binding) {
  if (!key) return;
  memoryThreads.set(key, binding);
  const disk = await loadThreadDisk();
  disk[key] = binding;
  const keys = Object.keys(disk);
  if (keys.length > THREAD_CACHE_MAX) {
    keys.sort((a, b) => (disk[a].updatedAt || 0) - (disk[b].updatedAt || 0)).slice(0, keys.length - THREAD_CACHE_MAX).forEach((k) => {
      delete disk[k];
      memoryThreads.delete(k);
    });
  }
  await saveThreadDisk(disk);
}
function clearPromptQlThreadBindingsForTests(opts) {
  memoryThreads.clear();
  if (opts?.disk) {
    const p = threadCachePath();
    if (p && existsSync(p)) {
      try {
        writeFileSync(p, "{}", "utf8");
      } catch {
      }
    }
  }
}
function readClientThreadId(body, headers) {
  const fromBody = readStr(body.promptql_thread_id) || readStr(body.thread_id);
  if (fromBody) return fromBody;
  if (!headers) return "";
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v ?? "");
  return readStr(lower["x-promptql-thread-id"]) || readStr(lower["x-thread-id"]) || readStr(lower["x-conversation-id"]) || "";
}
async function resolvePromptQlThreadBinding(projectId, messages, clientThreadId) {
  const clientId = (clientThreadId || "").trim();
  const prefix = historyPrefixBeforeLastUser(messages);
  const prefixKey = prefix.length > 0 && hasAssistantMessage(prefix) ? conversationFingerprint(projectId, prefix) : null;
  if (clientId) {
    return { threadId: clientId, isFollowUp: true, prefixKey };
  }
  if (prefixKey) {
    const cached = await getThreadBinding(prefixKey);
    if (cached?.threadId && cached.projectId === projectId) {
      return { threadId: cached.threadId, isFollowUp: true, prefixKey };
    }
  }
  if (hasAssistantMessage(messages)) {
    const scope = prefix.length ? prefix : messages;
    for (const asstKey of lastAssistantStickyKeys(projectId, scope)) {
      const cached = await getThreadBinding(asstKey);
      if (cached?.threadId && cached.projectId === projectId) {
        return { threadId: cached.threadId, isFollowUp: true, prefixKey: asstKey };
      }
    }
    if (scope !== messages) {
      for (const asstKey of lastAssistantStickyKeys(projectId, messages)) {
        const cached = await getThreadBinding(asstKey);
        if (cached?.threadId && cached.projectId === projectId) {
          return { threadId: cached.threadId, isFollowUp: true, prefixKey: asstKey };
        }
      }
    }
  }
  return { threadId: "", isFollowUp: false, prefixKey: null };
}
async function storePromptQlThreadAfterTurn(projectId, messages, assistantText, threadId) {
  if (!projectId || !threadId) return null;
  const full = [
    ...messages,
    { role: "assistant", content: assistantText || "" }
  ];
  if (!hasAssistantMessage(full) || !messages.some((m) => isUserLikeRole(m.role || ""))) {
    return null;
  }
  const key = conversationFingerprint(projectId, full);
  const binding = { threadId, projectId, updatedAt: Date.now() };
  await setThreadBinding(key, binding);
  const prefix = historyPrefixBeforeLastUser(messages);
  if (prefix.length > 0 && hasAssistantMessage(prefix)) {
    await setThreadBinding(conversationFingerprint(projectId, prefix), binding);
  }
  for (const asstKey of lastAssistantStickyKeys(projectId, full)) {
    await setThreadBinding(asstKey, binding);
  }
  return key;
}
export {
  clearPromptQlThreadBindingsForTests,
  conversationFingerprint,
  extractToolNameSignature,
  hasAssistantMessage,
  historyPrefixBeforeLastUser,
  lastAssistantFingerprint,
  lastAssistantStickyKeys,
  normalizeForFingerprint,
  readClientThreadId,
  resolvePromptQlThreadBinding,
  storePromptQlThreadAfterTurn
};
