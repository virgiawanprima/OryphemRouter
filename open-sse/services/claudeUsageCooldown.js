const OAUTH_USAGE_429_COOLDOWN_MS = 18e4;
const oauthCooldown = /* @__PURE__ */ new Map();
function isClaudeOauthUsageCoolingDown(accessToken, now = Date.now()) {
  if (!accessToken) return false;
  const until = oauthCooldown.get(accessToken);
  if (until === void 0) return false;
  if (until > now) return true;
  oauthCooldown.delete(accessToken);
  return false;
}
function markClaudeOauthUsage429(accessToken, now = Date.now(), cooldownMs = OAUTH_USAGE_429_COOLDOWN_MS) {
  if (!accessToken) return;
  oauthCooldown.set(accessToken, now + cooldownMs);
}
function _resetClaudeOauthUsageCooldown() {
  oauthCooldown.clear();
}
export {
  OAUTH_USAGE_429_COOLDOWN_MS,
  _resetClaudeOauthUsageCooldown,
  isClaudeOauthUsageCoolingDown,
  markClaudeOauthUsage429
};
