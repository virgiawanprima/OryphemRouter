const DEFAULT_LEASE_MS = 10 * 6e4;
const occupancy = /* @__PURE__ */ new Map();
function prune(now = Date.now()) {
  for (const [connectionId, sessions] of occupancy) {
    for (const [sessionKey, lease] of sessions) {
      if (lease.expiresAt <= now) sessions.delete(sessionKey);
    }
    if (sessions.size === 0) occupancy.delete(connectionId);
  }
}
function getForeignOAuthSessionCount(connectionId, sessionKey, now = Date.now()) {
  if (!connectionId) return 0;
  prune(now);
  const sessions = occupancy.get(connectionId);
  if (!sessions) return 0;
  let count = 0;
  for (const key of sessions.keys()) {
    if (!sessionKey || key !== sessionKey) count++;
  }
  return count;
}
function getOAuthSessionAvailability(connectionId, sessionKey, now = Date.now()) {
  return 1 / (1 + getForeignOAuthSessionCount(connectionId, sessionKey, now));
}
function reserveOAuthSession(connectionId, sessionKey, leaseMs = DEFAULT_LEASE_MS, now = Date.now()) {
  if (!connectionId || !sessionKey) return () => {
  };
  prune(now);
  const sessions = occupancy.get(connectionId) ?? /* @__PURE__ */ new Map();
  const current = sessions.get(sessionKey);
  sessions.set(sessionKey, {
    requests: (current?.requests ?? 0) + 1,
    expiresAt: now + Math.max(1, leaseMs)
  });
  occupancy.set(connectionId, sessions);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const activeSessions = occupancy.get(connectionId);
    const active = activeSessions?.get(sessionKey);
    if (!activeSessions || !active) return;
    if (active.requests <= 1) activeSessions.delete(sessionKey);
    else activeSessions.set(sessionKey, { ...active, requests: active.requests - 1 });
    if (activeSessions.size === 0) occupancy.delete(connectionId);
  };
}
function wrapResponseWithOAuthSessionRelease(response, release) {
  if (!response.body) {
    release();
    return response;
  }
  const reader = response.body.getReader();
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        release();
        controller.error(error);
      }
    },
    async cancel(reason) {
      release();
      try {
        await reader.cancel(reason);
      } catch {
      }
    }
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}
function _clearOAuthSessionOccupancyForTest() {
  occupancy.clear();
}
export {
  _clearOAuthSessionOccupancyForTest,
  getForeignOAuthSessionCount,
  getOAuthSessionAvailability,
  reserveOAuthSession,
  wrapResponseWithOAuthSessionRelease
};
