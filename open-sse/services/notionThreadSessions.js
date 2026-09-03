import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
function extractNotionMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const p of content) {
    if (typeof p === "string") {
      if (p) parts.push(p);
      continue;
    }
    if (!p || typeof p !== "object") continue;
    const o = p;
    if (typeof o.text === "string" && o.text) parts.push(o.text);
    else if (typeof o.content === "string" && o.content) parts.push(o.content);
  }
  return parts.join("\n");
}
const THREAD_SESSION_MAX_AGE_MS = 7 * 24 * 36e5;
const THREAD_SESSION_MAX_ENTRIES = 500;
const threadSessionCache = /* @__PURE__ */ new Map();
let threadStoreLoaded = false;
let threadStoreDirty = false;
let threadStoreTimer = null;
function getThreadStorePath() {
  try {
    const dataDir = process.env.DATA_DIR || process.env.OMNIROUTE_DATA_DIR || process.env.VIBEPROXY_DATA_DIR || (process.env.USERPROFILE ? join(process.env.USERPROFILE, ".omniroute") : "") || (process.env.HOME ? join(process.env.HOME, ".omniroute") : "") || "";
    if (!dataDir) return null;
    return join(dataDir, "notion-web-thread-sessions.json");
  } catch {
    return null;
  }
}
function loadThreadStoreFromDisk() {
  if (threadStoreLoaded) return;
  threadStoreLoaded = true;
  const path = getThreadStorePath();
  if (!path || !existsSync(path)) return;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed || {})) {
      if (!v?.threadId || typeof v.ts !== "number") continue;
      if (now - v.ts > THREAD_SESSION_MAX_AGE_MS) continue;
      threadSessionCache.set(k, v);
    }
  } catch {
  }
}
function scheduleThreadStoreFlush() {
  threadStoreDirty = true;
  if (threadStoreTimer) return;
  threadStoreTimer = setTimeout(() => {
    threadStoreTimer = null;
    flushThreadStoreToDisk();
  }, 250);
  if (typeof threadStoreTimer === "object" && threadStoreTimer && "unref" in threadStoreTimer) {
    try {
      threadStoreTimer.unref();
    } catch {
    }
  }
}
function flushThreadStoreToDisk() {
  if (!threadStoreDirty) return;
  const path = getThreadStorePath();
  if (!path) return;
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj = {};
    for (const [k, v] of threadSessionCache) obj[k] = v;
    writeFileSync(path, JSON.stringify(obj), "utf8");
    threadStoreDirty = false;
  } catch {
  }
}
function __resetNotionThreadSessionsForTests() {
  threadSessionCache.clear();
  threadStoreLoaded = true;
  threadStoreDirty = false;
  if (threadStoreTimer) {
    clearTimeout(threadStoreTimer);
    threadStoreTimer = null;
  }
}
function normalizeNotionContentForHash(content) {
  let text = extractNotionMessageText(content).replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const taskMarkers = ["My current task:", "my current task:"];
  for (const marker of taskMarkers) {
    const idx = text.lastIndexOf(marker);
    if (idx >= 0) {
      text = text.slice(idx + marker.length).trim();
      break;
    }
  }
  if (text.includes("local workflow automation tool") || text.includes("clipboard parser")) {
    const intentIdx = text.lastIndexOf("Intent:");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) text = lines[lines.length - 1];
    void intentIdx;
  }
  return text.replace(/\s+/g, " ").trim();
}
function hashNotionConversation(spaceId, msgs) {
  const parts = [
    `space:${spaceId}`,
    ...msgs.map((h) => `${(h.role || "").toLowerCase()}:${normalizeNotionContentForHash(h.content)}`)
  ];
  const raw = parts.join("\n");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function conversationPrefixBeforeLastUser(messages) {
  if (!messages.length) return [];
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role === "user" || role === "human") {
      lastUser = i;
      break;
    }
  }
  if (lastUser <= 0) return [];
  return messages.slice(0, lastUser);
}
function readThreadSessionEntry(key) {
  loadThreadStoreFromDisk();
  const entry = threadSessionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > THREAD_SESSION_MAX_AGE_MS) {
    threadSessionCache.delete(key);
    scheduleThreadStoreFlush();
    return null;
  }
  return entry;
}
function readThreadSession(key) {
  return readThreadSessionEntry(key)?.threadId ?? null;
}
function putThreadSession(key, threadId, flags = {}) {
  loadThreadStoreFromDisk();
  const prev = threadSessionCache.get(key);
  threadSessionCache.set(key, {
    threadId,
    ts: Date.now(),
    confirmed: flags.confirmed ?? prev?.confirmed ?? false,
    createAttempted: flags.createAttempted ?? prev?.createAttempted ?? false
  });
  if (threadSessionCache.size > THREAD_SESSION_MAX_ENTRIES) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of threadSessionCache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) threadSessionCache.delete(oldestKey);
  }
  scheduleThreadStoreFlush();
}
function notionThreadRootKey(spaceKey, messages) {
  void messages;
  return spaceKey ? `root:space:${spaceKey}` : null;
}
function resolveNotionThreadBinding(spaceKey, messages, clientThreadId) {
  loadThreadStoreFromDisk();
  const rootKey = notionThreadRootKey(spaceKey, messages);
  const hasHistory = conversationHasAssistant(messages);
  if (clientThreadId && clientThreadId.trim()) {
    const id = clientThreadId.trim();
    if (rootKey) putThreadSession(rootKey, id, { createAttempted: true });
    return { threadId: id, createThread: false, rootKey };
  }
  const prefix = conversationPrefixBeforeLastUser(messages);
  if (prefix.length > 0) {
    const exactId = readThreadSession(hashNotionConversation(spaceKey, prefix));
    if (exactId) {
      if (rootKey) putThreadSession(rootKey, exactId, { createAttempted: true, confirmed: true });
      return { threadId: exactId, createThread: false, rootKey };
    }
  }
  if (rootKey) {
    const sticky = readThreadSessionEntry(rootKey);
    if (sticky?.threadId) {
      if (hasHistory) {
        putThreadSession(rootKey, sticky.threadId, {
          confirmed: sticky.confirmed,
          createAttempted: sticky.createAttempted
        });
        return {
          threadId: sticky.threadId,
          createThread: false,
          rootKey
        };
      }
      if (sticky.createAttempted && !sticky.confirmed) {
        putThreadSession(rootKey, sticky.threadId, {
          confirmed: false,
          createAttempted: true
        });
        return {
          threadId: sticky.threadId,
          createThread: false,
          rootKey
        };
      }
      if (!sticky.createAttempted && !sticky.confirmed) {
        putThreadSession(rootKey, sticky.threadId, {
          confirmed: false,
          createAttempted: false
        });
        return {
          threadId: sticky.threadId,
          createThread: true,
          rootKey
        };
      }
    }
  }
  const threadId = randomUUID();
  if (rootKey) {
    putThreadSession(rootKey, threadId, {
      createAttempted: false,
      confirmed: false
    });
  }
  return { threadId, createThread: true, rootKey };
}
function notionThreadMarkCreateAttempted(rootKey, threadId) {
  if (!rootKey || !threadId) return;
  putThreadSession(rootKey, threadId, { createAttempted: true });
}
function notionThreadMarkConfirmed(rootKey, threadId) {
  if (!rootKey || !threadId) return;
  putThreadSession(rootKey, threadId, { createAttempted: true, confirmed: true });
}
function conversationHasAssistant(messages) {
  return messages.some((m) => {
    const role = (m?.role || "").toLowerCase();
    return role === "assistant" || role === "ai" || role === "model";
  });
}
function notionThreadSessionLookup(spaceId, messages) {
  loadThreadStoreFromDisk();
  const rootKey = notionThreadRootKey(spaceId, messages);
  if (rootKey) {
    const sticky = readThreadSession(rootKey);
    if (sticky) return sticky;
  }
  const prefix = conversationPrefixBeforeLastUser(messages);
  if (prefix.length === 0) return null;
  return readThreadSession(hashNotionConversation(spaceId, prefix));
}
function notionThreadSessionStore(spaceId, messages, assistantText, threadId) {
  if (!threadId || !spaceId) return;
  const full = [...messages, { role: "assistant", content: assistantText }];
  putThreadSession(hashNotionConversation(spaceId, full), threadId, {
    confirmed: true,
    createAttempted: true
  });
  const rootKey = notionThreadRootKey(spaceId, messages);
  if (rootKey) {
    putThreadSession(rootKey, threadId, { confirmed: true, createAttempted: true });
  }
  void assistantText;
}
function isValidNotionThreadId(id) {
  const t = id.trim().replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(t);
}
function readClientThreadId(body, headers) {
  const fromBody = typeof body.notion_thread_id === "string" && body.notion_thread_id.trim() || typeof body.thread_id === "string" && body.thread_id.trim() || "";
  if (fromBody) return isValidNotionThreadId(fromBody) ? fromBody : "";
  if (!headers) return "";
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "x-notion-thread-id" && typeof v === "string" && v.trim()) {
      const h = v.trim();
      return isValidNotionThreadId(h) ? h : "";
    }
  }
  return "";
}
function hashNotionCallerCookie(cookie) {
  const raw = (cookie || "").trim();
  if (!raw) return "anon";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
export {
  __resetNotionThreadSessionsForTests,
  conversationPrefixBeforeLastUser,
  extractNotionMessageText,
  hashNotionCallerCookie,
  hashNotionConversation,
  isValidNotionThreadId,
  normalizeNotionContentForHash,
  notionThreadMarkConfirmed,
  notionThreadMarkCreateAttempted,
  notionThreadRootKey,
  notionThreadSessionLookup,
  notionThreadSessionStore,
  readClientThreadId,
  resolveNotionThreadBinding
};
