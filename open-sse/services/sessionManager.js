import { createHash } from "node:crypto";
const sessions = /* @__PURE__ */ new Map();
const MAX_SESSIONS = 200;
const SESSION_TTL_MS = 15 * 60 * 1e3;
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessions) {
    if (now - entry.lastActive > SESSION_TTL_MS) {
      sessions.delete(key);
      const keysToDelete = [];
      for (const [apiKeyId, sessionSet] of activeSessionsByKey) {
        sessionSet.delete(key);
        if (sessionSet.size === 0) keysToDelete.push(apiKeyId);
      }
      for (const k of keysToDelete) {
        activeSessionsByKey.delete(k);
      }
    }
  }
  while (sessions.size > MAX_SESSIONS) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of sessions) {
      if (entry.lastActive < oldestTime) {
        oldestTime = entry.lastActive;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    sessions.delete(oldestKey);
    const evictionKeys = [];
    for (const [apiKeyId, sessionSet] of activeSessionsByKey) {
      sessionSet.delete(oldestKey);
      if (sessionSet.size === 0) evictionKeys.push(apiKeyId);
    }
    for (const k of evictionKeys) {
      activeSessionsByKey.delete(k);
    }
  }
}, 6e4);
if (typeof _cleanupTimer === "object" && "unref" in _cleanupTimer) {
  _cleanupTimer.unref?.();
}
function generateSessionId(body, options = {}) {
  if (!body || typeof body !== "object") return null;
  const parts = [];
  if (body.model) parts.push(`model:${body.model}`);
  if (options.provider) parts.push(`provider:${options.provider}`);
  const systemPrompt = extractSystemPrompt(body);
  if (systemPrompt) {
    parts.push(`sys:${hashShort(systemPrompt)}`);
  }
  const firstUser = extractFirstUserMessage(body);
  if (firstUser) {
    parts.push(`user0:${hashShort(firstUser)}`);
  }
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    const toolNames = body.tools.map((t) => t.name || t.function?.name || "").filter(Boolean).sort().join(",");
    if (toolNames) parts.push(`tools:${hashShort(toolNames)}`);
  }
  if (options.connectionId) parts.push(`conn:${options.connectionId}`);
  if (parts.length === 0) return null;
  const fingerprint = parts.join("|");
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}
function touchSession(sessionId, connectionId = null) {
  if (!sessionId) return;
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastActive = Date.now();
    existing.requestCount++;
    if (connectionId) existing.connectionId = connectionId;
  } else {
    sessions.set(sessionId, {
      createdAt: Date.now(),
      lastActive: Date.now(),
      requestCount: 1,
      connectionId
    });
  }
}
function markToolFinish(sessionId) {
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (session) session.lastToolFinishAt = Date.now();
}
function consumeToolFinishTime(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session?.lastToolFinishAt) return null;
  const ts = session.lastToolFinishAt;
  session.lastToolFinishAt = void 0;
  return ts;
}
function getSessionInfo(sessionId) {
  if (!sessionId) return null;
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.lastActive > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return { ...entry };
}
function getSessionConnection(sessionId) {
  const info = getSessionInfo(sessionId);
  return info?.connectionId || null;
}
function getActiveSessionCount() {
  return sessions.size;
}
function getActiveSessions() {
  const now = Date.now();
  const result = [];
  for (const [id, entry] of sessions) {
    if (now - entry.lastActive <= SESSION_TTL_MS) {
      result.push({ sessionId: id, ...entry, ageMs: now - entry.createdAt });
    }
  }
  return result;
}
function clearSessions() {
  sessions.clear();
  activeSessionsByKey.clear();
}
const activeSessionsByKey = /* @__PURE__ */ new Map();
function getActiveSessionCountForKey(apiKeyId) {
  return activeSessionsByKey.get(apiKeyId)?.size ?? 0;
}
function getAllActiveSessionCountsByKey() {
  const out = {};
  for (const [apiKeyId, sessionIds] of activeSessionsByKey) {
    out[apiKeyId] = sessionIds.size;
  }
  return out;
}
function registerKeySession(apiKeyId, sessionId) {
  if (!activeSessionsByKey.has(apiKeyId)) {
    activeSessionsByKey.set(apiKeyId, /* @__PURE__ */ new Set());
  }
  activeSessionsByKey.get(apiKeyId).add(sessionId);
}
function isSessionRegisteredForKey(apiKeyId, sessionId) {
  return activeSessionsByKey.get(apiKeyId)?.has(sessionId) === true;
}
function unregisterKeySession(apiKeyId, sessionId) {
  activeSessionsByKey.get(apiKeyId)?.delete(sessionId);
  if (activeSessionsByKey.get(apiKeyId)?.size === 0) {
    activeSessionsByKey.delete(apiKeyId);
  }
}
function checkSessionLimit(apiKeyId, maxSessions) {
  if (!maxSessions || maxSessions <= 0) return null;
  const current = getActiveSessionCountForKey(apiKeyId);
  if (current < maxSessions) return null;
  return {
    code: "SESSION_LIMIT_EXCEEDED",
    message: `You have reached the maximum number of active sessions (${maxSessions}). Please close unused sessions or wait for them to expire.`,
    limit: maxSessions,
    current
  };
}
function extractExternalSessionId(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  const h = headers;
  const raw = h.get("x-session-id") ?? // Preferred: hyphenated (passes through Nginx)
  h.get("x_session_id") ?? // Underscore variant (direct HTTP / custom clients)
  h.get("x-omniroute-session") ?? // OmniRoute-specific form
  h.get("session-id") ?? // Bare session-id
  null;
  if (!raw || !raw.trim()) return null;
  return `ext:${raw.trim().slice(0, 64)}`;
}
function hashShort(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}
function extractSystemPrompt(body) {
  if (!body || typeof body !== "object") return null;
  if (body.system) {
    return typeof body.system === "string" ? body.system : JSON.stringify(body.system);
  }
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find((m) => m.role === "system" || m.role === "developer");
    if (sys) {
      return typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content);
    }
  }
  return null;
}
function extractFirstUserMessage(body) {
  if (!body || typeof body !== "object") return null;
  const messages = body.messages || body.input || [];
  if (!Array.isArray(messages)) return null;
  for (const msg of messages) {
    if (msg.role === "user") {
      return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    }
  }
  return null;
}
export {
  checkSessionLimit,
  clearSessions,
  consumeToolFinishTime,
  extractExternalSessionId,
  generateSessionId,
  getActiveSessionCount,
  getActiveSessionCountForKey,
  getActiveSessions,
  getAllActiveSessionCountsByKey,
  getSessionConnection,
  getSessionInfo,
  isSessionRegisteredForKey,
  markToolFinish,
  registerKeySession,
  touchSession,
  unregisterKeySession
};
