const ANTIGRAVITY_IDE_RELEASE_FEED_URL = "https://antigravity-auto-updater-974169037036.us-central1.run.app/releases";
const ANTIGRAVITY_CLI_RELEASE_URL = "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/latest";
const ANTIGRAVITY_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
const ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS = 5e3;
const ANTIGRAVITY_IDE_FALLBACK_VERSION = "2.1.1";
const ANTIGRAVITY_CLI_FALLBACK_VERSION = "1.1.5";
const ideState = { cache: null, inFlight: null };
const cliState = { cache: null, inFlight: null };
function normalizeVersion(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^v/i, "");
  const match = trimmed.match(/^(\d+\.\d+\.\d+)\b/);
  return match ? match[1] : null;
}
function compareSemver(a, b) {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
  }
  return 0;
}
function pickNewestVersion(...versions) {
  return versions.map((version) => normalizeVersion(version)).filter((version) => !!version).reduce(
    (best, version) => !best || compareSemver(version, best) > 0 ? version : best,
    null
  );
}
async function fetchJsonWithTimeout(fetchImpl, url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OmniRoute-AntigravityVersion/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Version source ${url} returned ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
function parseIdeReleaseFeed(payload) {
  if (!Array.isArray(payload)) return null;
  return pickNewestVersion(...payload.map((entry) => entry?.version));
}
function parseCliRelease(payload) {
  if (!payload || typeof payload !== "object") return null;
  const release = payload;
  return normalizeVersion(release.tag_name ?? release.name);
}
async function resolveProductVersion(state, fallbackVersion, sourceUrl, parsePayload, fetchImpl) {
  const now = Date.now();
  if (state.cache && now - state.cache.fetchedAt < ANTIGRAVITY_VERSION_CACHE_TTL_MS) {
    return pickNewestVersion(state.cache.version, fallbackVersion) ?? fallbackVersion;
  }
  if (state.inFlight) {
    return state.inFlight;
  }
  state.inFlight = (async () => {
    let resolved = null;
    try {
      resolved = parsePayload(await fetchJsonWithTimeout(fetchImpl, sourceUrl));
    } catch {
      resolved = null;
    }
    const version = pickNewestVersion(resolved, state.cache?.version, fallbackVersion) ?? fallbackVersion;
    if (resolved) {
      state.cache = {
        fetchedAt: Date.now(),
        version
      };
    }
    return version;
  })();
  try {
    return await state.inFlight;
  } finally {
    state.inFlight = null;
  }
}
function seedVersionCache(state, version, fetchedAt) {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    throw new TypeError(`Invalid Antigravity version: ${version}`);
  }
  state.cache = { fetchedAt, version: normalized };
}
function resolveAntigravityIdeVersion(fetchImpl = fetch) {
  return resolveProductVersion(
    ideState,
    ANTIGRAVITY_IDE_FALLBACK_VERSION,
    ANTIGRAVITY_IDE_RELEASE_FEED_URL,
    parseIdeReleaseFeed,
    fetchImpl
  );
}
function resolveAntigravityCliVersion(fetchImpl = fetch) {
  return resolveProductVersion(
    cliState,
    ANTIGRAVITY_CLI_FALLBACK_VERSION,
    ANTIGRAVITY_CLI_RELEASE_URL,
    parseCliRelease,
    fetchImpl
  );
}
function getCachedAntigravityIdeVersion() {
  return ideState.cache?.version ?? ANTIGRAVITY_IDE_FALLBACK_VERSION;
}
function getCachedAntigravityCliVersion() {
  return cliState.cache?.version ?? ANTIGRAVITY_CLI_FALLBACK_VERSION;
}
function seedAntigravityIdeVersionCache(version, fetchedAt = Date.now()) {
  seedVersionCache(ideState, version, fetchedAt);
}
function seedAntigravityCliVersionCache(version, fetchedAt = Date.now()) {
  seedVersionCache(cliState, version, fetchedAt);
}
function clearAntigravityVersionCaches() {
  ideState.cache = null;
  ideState.inFlight = null;
  cliState.cache = null;
  cliState.inFlight = null;
}
export {
  ANTIGRAVITY_CLI_FALLBACK_VERSION,
  ANTIGRAVITY_IDE_FALLBACK_VERSION,
  ANTIGRAVITY_VERSION_CACHE_TTL_MS,
  ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS,
  clearAntigravityVersionCaches,
  getCachedAntigravityCliVersion,
  getCachedAntigravityIdeVersion,
  resolveAntigravityCliVersion,
  resolveAntigravityIdeVersion,
  seedAntigravityCliVersionCache,
  seedAntigravityIdeVersionCache
};
