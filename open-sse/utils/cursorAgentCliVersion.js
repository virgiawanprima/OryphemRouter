import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const CURSOR_AGENT_CLI_VERSION = "2026.07.08-0c04a8a";
const VERSION_ID_RE = /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]+$/;
const CACHE_TTL_MS = 60 * 60 * 1e3;
const INSTALL_URL = "https://cursor.com/install";
const REMOTE_TIMEOUT_MS = 5e3;
const VERSION_CACHE_FILE = "cursor-agent-cli-version.json";
let cachedVersion = null;
let cachedAt = 0;
let remoteRefreshInFlight = null;
let remoteRefreshScheduled = false;
let fetchImpl = fetch;
let cacheDirOverride = null;
function isCursorAgentCliVersionId(value) {
  return VERSION_ID_RE.test(value);
}
function formatCursorAgentClientVersion(id) {
  return `cli-${id}`;
}
function extractVersionIdFromResolvedPath(resolvedPath) {
  const parts = resolvedPath.split(/[/\\]/);
  const versionsIdx = parts.lastIndexOf("versions");
  if (versionsIdx < 0 || versionsIdx + 1 >= parts.length) return null;
  const id = parts[versionsIdx + 1];
  return isCursorAgentCliVersionId(id) ? id : null;
}
function newestVersionInDir(versionsDir) {
  try {
    if (!existsSync(versionsDir)) return null;
    let newest = null;
    for (const name of readdirSync(versionsDir)) {
      if (!isCursorAgentCliVersionId(name)) continue;
      try {
        const st = lstatSync(join(versionsDir, name));
        if (!st.isDirectory()) continue;
        const mtimeMs = st.mtimeMs;
        if (!newest || mtimeMs > newest.mtimeMs || mtimeMs === newest.mtimeMs && name > newest.name) {
          newest = { name, mtimeMs };
        }
      } catch {
      }
    }
    return newest?.name ?? null;
  } catch {
    return null;
  }
}
function versionFromShim(shimPath) {
  try {
    if (!existsSync(shimPath)) return null;
    const resolved = realpathSync(shimPath);
    return extractVersionIdFromResolvedPath(resolved);
  } catch {
    return null;
  }
}
function defaultVersionsDir(home) {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return join(localAppData, "cursor-agent", "versions");
  }
  return join(home, ".local", "share", "cursor-agent", "versions");
}
function detectCursorAgentCliVersionFromFs(home = homedir()) {
  const localBin = join(home, ".local", "bin");
  for (const name of ["agent", "cursor-agent"]) {
    const fromShim = versionFromShim(join(localBin, name));
    if (fromShim) return fromShim;
  }
  const dataDir = process.env.CURSOR_DATA_DIR;
  const versionsDir = dataDir ? join(dataDir, "versions") : defaultVersionsDir(home);
  return newestVersionInDir(versionsDir);
}
function resolveCacheDir() {
  if (cacheDirOverride) return cacheDirOverride;
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) return join(dataDir, "cache");
  return join(homedir(), ".omniroute", "cache");
}
function versionCachePath() {
  return join(resolveCacheDir(), VERSION_CACHE_FILE);
}
function extractVersionIdFromInstallerScript(script) {
  const match = script.match(/downloads\.cursor\.com\/lab\/([^/"'\s]+)\//);
  if (!match) return null;
  const id = match[1];
  return isCursorAgentCliVersionId(id) ? id : null;
}
function readDiskVersionCache() {
  try {
    const raw = JSON.parse(readFileSync(versionCachePath(), "utf8"));
    if (typeof raw.version !== "string" || !isCursorAgentCliVersionId(raw.version)) return null;
    if (typeof raw.fetchedAt !== "number" || !Number.isFinite(raw.fetchedAt)) return null;
    return { version: raw.version, fetchedAt: raw.fetchedAt };
  } catch {
    return null;
  }
}
function writeDiskVersionCache(cache) {
  try {
    const dir = resolveCacheDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(versionCachePath(), JSON.stringify(cache, null, 2));
  } catch {
  }
}
async function fetchInstallerVersionId() {
  const response = await fetchImpl(INSTALL_URL, {
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS)
  });
  if (!response.ok) return null;
  const text = await response.text();
  return extractVersionIdFromInstallerScript(text);
}
function scheduleRemoteVersionRefresh() {
  if (remoteRefreshInFlight || remoteRefreshScheduled) return;
  remoteRefreshScheduled = true;
  setTimeout(() => {
    remoteRefreshScheduled = false;
    if (remoteRefreshInFlight) return;
    remoteRefreshInFlight = (async () => {
      try {
        const id = await fetchInstallerVersionId();
        if (id) writeDiskVersionCache({ version: id, fetchedAt: Date.now() });
      } catch {
      } finally {
        remoteRefreshInFlight = null;
      }
    })();
  }, 0);
}
function getCursorAgentCliVersion() {
  const now = Date.now();
  if (cachedVersion && now - cachedAt < CACHE_TTL_MS) {
    return cachedVersion;
  }
  const fromEnv = process.env.CURSOR_AGENT_CLI_VERSION?.trim();
  if (fromEnv && isCursorAgentCliVersionId(fromEnv)) {
    cachedVersion = fromEnv;
    cachedAt = now;
    return cachedVersion;
  }
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const fromFs = detectCursorAgentCliVersionFromFs(home);
  if (fromFs) {
    cachedVersion = fromFs;
    cachedAt = now;
    return cachedVersion;
  }
  const disk = readDiskVersionCache();
  if (disk) {
    cachedVersion = disk.version;
    cachedAt = now;
    scheduleRemoteVersionRefresh();
    return cachedVersion;
  }
  scheduleRemoteVersionRefresh();
  return CURSOR_AGENT_CLI_VERSION;
}
async function refreshCursorAgentCliVersionFromInstaller() {
  try {
    const id = await fetchInstallerVersionId();
    if (id) {
      writeDiskVersionCache({ version: id, fetchedAt: Date.now() });
      cachedVersion = id;
      cachedAt = Date.now();
      return id;
    }
  } catch {
  }
  return null;
}
function resetCursorAgentCliVersionCache() {
  cachedVersion = null;
  cachedAt = 0;
  remoteRefreshInFlight = null;
  remoteRefreshScheduled = false;
}
function configureCursorAgentCliVersionForTests(options) {
  if (options.fetchImpl) fetchImpl = options.fetchImpl;
  if (options.cacheDir !== void 0) cacheDirOverride = options.cacheDir;
}
function resetCursorAgentCliVersionTestHooks() {
  fetchImpl = fetch;
  cacheDirOverride = null;
  resetCursorAgentCliVersionCache();
}
export {
  CURSOR_AGENT_CLI_VERSION,
  configureCursorAgentCliVersionForTests,
  detectCursorAgentCliVersionFromFs,
  extractVersionIdFromInstallerScript,
  extractVersionIdFromResolvedPath,
  formatCursorAgentClientVersion,
  getCursorAgentCliVersion,
  isCursorAgentCliVersionId,
  newestVersionInDir,
  refreshCursorAgentCliVersionFromInstaller,
  resetCursorAgentCliVersionCache,
  resetCursorAgentCliVersionTestHooks
};
