// Minimal `getSessionInfo` for quotaMonitor. OmniRoute's services/sessionManager
// tracks active sessions in memory; OryphemRouter's utils/sessionManager does not
// expose session info, so this returns null (session-unbound behavior).
export function getSessionInfo() {
  return null;
}
