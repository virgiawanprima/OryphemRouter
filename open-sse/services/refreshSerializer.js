const ROTATION_LOCK_GROUP = {
  codex: "openai-auth0",
  openai: "openai-auth0",
  claude: "anthropic-oauth",
  "gitlab-duo": "gitlab-duo",
  kiro: "kiro",
  "kimi-coding": "kimi-coding"
};
const DEFAULT_REFRESH_SPACING_MS = 2e3;
function getRefreshSpacingMs() {
  const rawEnv = process.env.CODEX_REFRESH_SPACING_MS;
  if (rawEnv === void 0 || rawEnv === "") return DEFAULT_REFRESH_SPACING_MS;
  const raw = Number(rawEnv);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REFRESH_SPACING_MS;
}
const groupTail = /* @__PURE__ */ new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function rotationGroupFor(provider) {
  return ROTATION_LOCK_GROUP[provider] ?? null;
}
async function serializeRefresh(provider, fn) {
  const group = rotationGroupFor(provider);
  if (!group) return fn();
  const prevTail = groupTail.get(group) ?? Promise.resolve();
  let releaseMine;
  const mine = new Promise((resolve) => {
    releaseMine = resolve;
  });
  const myTail = prevTail.then(() => mine);
  groupTail.set(group, myTail);
  await prevTail.catch(() => {
  });
  try {
    return await fn();
  } finally {
    const hasSuccessor = groupTail.get(group) !== myTail;
    if (hasSuccessor) {
      const spacing = getRefreshSpacingMs();
      if (spacing > 0) await delay(spacing);
    }
    releaseMine();
    if (groupTail.get(group) === myTail) groupTail.delete(group);
  }
}
function wasRefreshTokenRotated(attemptedRefreshToken, latestRefreshToken) {
  return typeof attemptedRefreshToken === "string" && attemptedRefreshToken.length > 0 && typeof latestRefreshToken === "string" && latestRefreshToken.length > 0 && latestRefreshToken !== attemptedRefreshToken;
}
function __resetRefreshSerializerForTest() {
  groupTail.clear();
}
export {
  __resetRefreshSerializerForTest,
  getRefreshSpacingMs,
  rotationGroupFor,
  serializeRefresh,
  wasRefreshTokenRotated
};
