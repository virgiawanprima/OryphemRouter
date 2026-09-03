import { encodeExecMcpResult } from "../utils/cursorAgentProtobuf.js";
const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1e3;
class CursorSessionManager {
  sessions = /* @__PURE__ */ new Map();
  idleTtlMs;
  maxSessions;
  constructor(opts = {}) {
    this.idleTtlMs = opts.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.maxSessions = opts.maxSessions ?? 100;
  }
  /**
   * Try to reacquire an existing session for this conversation. Returns
   * undefined if there isn't one, if it's still running, or if it's idle
   * past the TTL (in which case it's closed as a side-effect).
   */
  acquire(conversationId) {
    this.evictExpired();
    const session = this.sessions.get(conversationId);
    if (!session) return void 0;
    if (session.state !== "awaiting_tool_result") return void 0;
    this.clearIdleTimer(session);
    session.state = "running";
    session.lastActivityTs = Date.now();
    return session;
  }
  /**
   * Register a freshly-opened h2 stream as the session for this conversation.
   * Any pre-existing session for the same conversation is closed first.
   */
  open(conversationId, h2Client, h2Req, blobStore) {
    const existing = this.sessions.get(conversationId);
    if (existing) this.close(existing);
    const session = {
      conversationId,
      h2Client,
      h2Req,
      blobStore,
      pendingToolCalls: /* @__PURE__ */ new Map(),
      state: "running",
      lastActivityTs: Date.now()
    };
    this.sessions.set(conversationId, session);
    this.attachCloseHandlers(session);
    this.enforceMaxSessions();
    return session;
  }
  /**
   * Mark a session as no longer in-flight. If finalState is
   * "awaiting_tool_result" the h2 stream stays open and the next acquire()
   * for this conversation_id can reuse it. If "idle" or "closed" the
   * h2 is torn down here.
   */
  release(session, finalState) {
    session.lastActivityTs = Date.now();
    if (finalState === "awaiting_tool_result") {
      session.state = "awaiting_tool_result";
      this.armIdleTimer(session);
      return;
    }
    this.close(session);
  }
  close(session) {
    if (session.state === "closed") return;
    session.state = "closed";
    this.clearIdleTimer(session);
    try {
      session.h2Req.close();
    } catch {
    }
    try {
      session.h2Client.close();
    } catch {
    }
    session.pendingToolCalls.clear();
    this.sessions.delete(session.conversationId);
  }
  /**
   * Send an MCP tool result on this session's open h2 stream. Returns true
   * if the openAIToolCallId matched a pending call we'd previously seen
   * mcp_args for; false otherwise (caller should fall back to cold-resume).
   */
  sendToolResult(session, openAIToolCallId, content, isError) {
    const pending = session.pendingToolCalls.get(openAIToolCallId);
    if (!pending) return false;
    try {
      session.h2Req.write(encodeExecMcpResult(pending.execMsgId, pending.execId, content, isError));
      session.pendingToolCalls.delete(openAIToolCallId);
      session.lastActivityTs = Date.now();
      return true;
    } catch {
      return false;
    }
  }
  evictExpired() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (now - session.lastActivityTs > this.idleTtlMs) {
        this.close(session);
      }
    }
  }
  armIdleTimer(session) {
    this.clearIdleTimer(session);
    session.idleTimer = setTimeout(() => this.close(session), this.idleTtlMs);
    session.idleTimer.unref?.();
  }
  clearIdleTimer(session) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = void 0;
    }
  }
  attachCloseHandlers(session) {
    const closeSession = () => this.close(session);
    session.h2Req.once?.("close", closeSession);
    session.h2Req.once?.("error", closeSession);
    session.h2Client.once?.("close", closeSession);
    session.h2Client.once?.("error", closeSession);
  }
  enforceMaxSessions() {
    if (this.sessions.size <= this.maxSessions) return;
    const oldest = Array.from(this.sessions.values()).sort(
      (a, b) => a.lastActivityTs - b.lastActivityTs
    )[0];
    if (oldest) this.close(oldest);
  }
  /**
   * Find a session that has one of the specified tool call IDs pending.
   * Only matches sessions in "awaiting_tool_result" state.
   * Transitions the found session to "running" (same as acquire).
   * This is used when the client doesn't provide conversation_id
   * (OpenAI-compatible clients), so we match by content instead of key.
   * Returns undefined if no session has any of the given IDs pending.
   */
  findByToolCallIds(toolCallIds) {
    this.evictExpired();
    for (const id of toolCallIds) {
      for (const session of this.sessions.values()) {
        if (session.state === "awaiting_tool_result" && session.pendingToolCalls.has(id)) {
          this.clearIdleTimer(session);
          session.state = "running";
          session.lastActivityTs = Date.now();
          return session;
        }
      }
    }
    return void 0;
  }
  // ─── Test / introspection helpers ────────────────────────────────────────
  size() {
    return this.sessions.size;
  }
  has(conversationId) {
    return this.sessions.has(conversationId);
  }
}
const cursorSessionManager = new CursorSessionManager();
export {
  CursorSessionManager,
  cursorSessionManager
};
