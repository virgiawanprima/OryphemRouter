const CODEX_TURN_STATE_HEADER = "x-codex-turn-state";
const CODEX_TURN_STATE_TTL_MS = 2 * 60 * 60 * 1e3;
const CODEX_TURN_STATE_SWEEP_EVERY_WRITES = 256;
const turnStateOrigins = /* @__PURE__ */ new Map();
let turnStateWrites = 0;
function normalizeAccountKey(accountKey) {
  if (typeof accountKey !== "string") return null;
  const trimmed = accountKey.trim();
  return trimmed || null;
}
function readCodexTurnStateHeader(headers) {
  if (!headers) return null;
  if (headers instanceof Headers) {
    const value = headers.get(CODEX_TURN_STATE_HEADER);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === CODEX_TURN_STATE_HEADER && typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}
function sweepExpiredTurnStateOrigins(now) {
  for (const [key, origin] of turnStateOrigins) {
    if (origin.expiresAt <= now) {
      turnStateOrigins.delete(key);
    }
  }
}
function noteCodexTurnStateProvenance(clientSessionId, accountKey, nowMs) {
  const sessionId = typeof clientSessionId === "string" ? clientSessionId.trim() : "";
  const account = normalizeAccountKey(accountKey);
  if (!sessionId || !account) return;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  turnStateOrigins.set(sessionId, {
    accountKey: account,
    expiresAt: now + CODEX_TURN_STATE_TTL_MS
  });
  turnStateWrites += 1;
  if (turnStateWrites % CODEX_TURN_STATE_SWEEP_EVERY_WRITES === 0) {
    sweepExpiredTurnStateOrigins(now);
  }
}
function isCrossAccountCodexTurnState(clientSessionId, accountKey, nowMs) {
  const sessionId = typeof clientSessionId === "string" ? clientSessionId.trim() : "";
  const account = normalizeAccountKey(accountKey);
  if (!sessionId || !account) return false;
  const origin = turnStateOrigins.get(sessionId);
  if (!origin) return false;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  if (origin.expiresAt <= now) {
    turnStateOrigins.delete(sessionId);
    return false;
  }
  return origin.accountKey !== account;
}
function __resetCodexTurnStateOriginsForTesting() {
  turnStateOrigins.clear();
  turnStateWrites = 0;
}
export {
  __resetCodexTurnStateOriginsForTesting,
  isCrossAccountCodexTurnState,
  noteCodexTurnStateProvenance,
  readCodexTurnStateHeader
};
