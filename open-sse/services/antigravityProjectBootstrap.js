import {
  getAntigravityContentHeaders,
  getAntigravityLoadCodeAssistMetadata
} from "./antigravityHeaders.js";
import { extractCodeAssistOnboardTierId } from "./codeAssistSubscription.js";
import {
  ANTIGRAVITY_BOOTSTRAP_BASE_URLS,
  getAntigravityOnboardUrls
} from "../utils/omni/antigravityUpstream.js";
import { log, sanitize } from "../utils/log.js";
const LOAD_CODE_ASSIST_PATH = "/v1internal:loadCodeAssist";
const BOOTSTRAP_TIMEOUT_MS = 8e3;
const ONBOARD_TIMEOUT_MS = 15e3;
const DEFAULT_TIER_ID = "legacy-tier";
function getAntigravityLoadCodeAssistUrls() {
  return ANTIGRAVITY_BOOTSTRAP_BASE_URLS.map((base) => `${base}${LOAD_CODE_ASSIST_PATH}`);
}
const MAX_CACHE_SIZE = 256;
function evictOldest(cache) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== void 0) cache.delete(oldest);
  }
}
const projectCache = /* @__PURE__ */ new Map();
const onboardLocks = /* @__PURE__ */ new Map();
const ANTIGRAVITY_REQUIRES_MANUAL_PROJECT = "__REQUIRES_GCP_PROJECT__";
const requiresManualProjectCache = /* @__PURE__ */ new Set();
function markRequiresManualProject(key) {
  if (requiresManualProjectCache.size >= MAX_CACHE_SIZE) {
    const oldest = requiresManualProjectCache.values().next().value;
    if (oldest !== void 0) requiresManualProjectCache.delete(oldest);
  }
  requiresManualProjectCache.add(key);
}
function getProjectCacheKey(accessToken, clientProfile) {
  return `${clientProfile}:${accessToken}`;
}
async function tryLoadCodeAssist(accessToken, fetchImpl, clientProfile, signal) {
  const urls = getAntigravityLoadCodeAssistUrls();
  const headers = getAntigravityContentHeaders(clientProfile, accessToken);
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (signal?.aborted) throw signal.reason;
    try {
      const timeoutSignal = AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS);
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ metadata: getAntigravityLoadCodeAssistMetadata() }),
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
      });
      if (!response.ok) {
        log.warn(
          "ANTIGRAVITY",
          `[models] antigravity loadCodeAssist failed at ${url} (${response.status}) \u2014 trying next`
        );
        continue;
      }
      const data = await response.json();
      const raw = data.cloudaicompanionProject;
      const projectId = typeof raw === "string" ? raw.trim() : raw && typeof raw === "object" && typeof raw.id === "string" ? raw.id.trim() : "";
      const tierId = extractCodeAssistOnboardTierId(data) || DEFAULT_TIER_ID;
      if (projectId) {
        return { projectId, tierId };
      }
      if (i === urls.length - 1) {
        return { projectId: null, tierId };
      }
      log.warn(
        "ANTIGRAVITY",
        `[models] antigravity loadCodeAssist at ${url} returned no project id \u2014 trying next`
      );
    } catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
        throw signal?.reason ?? error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      log.warn("ANTIGRAVITY", `[models] antigravity loadCodeAssist threw for ${url}: ${sanitize(msg)} \u2014 trying next`);
    }
  }
  return { projectId: null, tierId: DEFAULT_TIER_ID };
}
async function tryOnboardUser(accessToken, fetchImpl, clientProfile, tierId, signal) {
  const urls = getAntigravityOnboardUrls();
  const headers = getAntigravityContentHeaders(clientProfile, accessToken);
  for (const url of urls) {
    if (signal?.aborted) throw signal.reason;
    try {
      const timeoutSignal = AbortSignal.timeout(ONBOARD_TIMEOUT_MS);
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tier_id: tierId,
          metadata: getAntigravityLoadCodeAssistMetadata()
        }),
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
      });
      if (response.ok) {
        const body = await response.text().catch(() => "");
        if (body && !/cloudaicompanionProject/.test(body)) {
          log.warn(
            "ANTIGRAVITY",
            `[models] antigravity onboardUser done but no project in response at ${url} \u2014 Google BYOP (user-defined GCP project) required`
          );
          return "requires_manual_project";
        }
        return "onboarded";
      }
      log.warn(
        "ANTIGRAVITY",
        `[models] antigravity onboardUser failed at ${url} (${response.status}) \u2014 trying next`
      );
    } catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
        throw signal?.reason ?? error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      log.warn("ANTIGRAVITY", `[models] antigravity onboardUser threw for ${url}: ${sanitize(msg)} \u2014 trying next`);
    }
  }
  return "failed";
}
const onboardFailureAt = /* @__PURE__ */ new Map();
const ONBOARD_RETRY_BACKOFF_MS = 5 * 60 * 1e3;
function markOnboardFailure(key) {
  if (onboardFailureAt.size >= MAX_CACHE_SIZE) {
    const oldest = onboardFailureAt.keys().next().value;
    if (oldest !== void 0) onboardFailureAt.delete(oldest);
  }
  onboardFailureAt.set(key, Date.now());
}
function isOnboardOnBackoff(key) {
  const failedAt = onboardFailureAt.get(key);
  if (failedAt === void 0) return false;
  if (Date.now() - failedAt >= ONBOARD_RETRY_BACKOFF_MS) {
    onboardFailureAt.delete(key);
    return false;
  }
  return true;
}
async function ensureAntigravityProjectAssigned(accessToken, fetchImpl = fetch, clientProfile = "ide", signal) {
  const cacheKey = getProjectCacheKey(accessToken, clientProfile);
  if (projectCache.has(cacheKey)) {
    const cached = projectCache.get(cacheKey);
    projectCache.delete(cacheKey);
    projectCache.set(cacheKey, cached);
    return cached;
  }
  const { projectId: initialProjectId, tierId } = await tryLoadCodeAssist(
    accessToken,
    fetchImpl,
    clientProfile,
    signal
  );
  let projectId = initialProjectId;
  if (!projectId && requiresManualProjectCache.has(cacheKey)) {
    return ANTIGRAVITY_REQUIRES_MANUAL_PROJECT;
  }
  if (!projectId && !isOnboardOnBackoff(cacheKey)) {
    let lock = onboardLocks.get(cacheKey);
    if (!lock) {
      lock = (async () => {
        let aborted = false;
        let succeeded = false;
        let requiresManual = false;
        try {
          const status = await tryOnboardUser(
            accessToken,
            fetchImpl,
            clientProfile,
            tierId,
            signal
          );
          if (status === "requires_manual_project") {
            markRequiresManualProject(cacheKey);
            requiresManual = true;
            return;
          }
          if (status === "onboarded") {
            const retry = await tryLoadCodeAssist(accessToken, fetchImpl, clientProfile, signal);
            if (retry.projectId) {
              evictOldest(projectCache);
              projectCache.set(cacheKey, retry.projectId);
              succeeded = true;
              return;
            }
          }
        } catch (e) {
          aborted = signal?.aborted === true;
          return;
        } finally {
          onboardLocks.delete(cacheKey);
          if (!aborted && !requiresManual) {
            if (succeeded) onboardFailureAt.delete(cacheKey);
            else markOnboardFailure(cacheKey);
          }
        }
      })();
      onboardLocks.set(cacheKey, lock);
    }
    await lock;
    if (projectCache.has(cacheKey)) return projectCache.get(cacheKey);
    if (requiresManualProjectCache.has(cacheKey)) return ANTIGRAVITY_REQUIRES_MANUAL_PROJECT;
  }
  if (projectId) {
    evictOldest(projectCache);
    projectCache.set(cacheKey, projectId);
    return projectId;
  }
  return void 0;
}
function clearAntigravityProjectCache() {
  projectCache.clear();
  onboardFailureAt.clear();
  requiresManualProjectCache.clear();
  onboardLocks.clear();
}
function clearAntigravityOnboardBackoff(key) {
  if (key) onboardFailureAt.delete(key);
  else onboardFailureAt.clear();
}
function getAntigravityProjectFromCache(accessToken, clientProfile = "ide") {
  return projectCache.get(getProjectCacheKey(accessToken, clientProfile));
}
export {
  ANTIGRAVITY_REQUIRES_MANUAL_PROJECT,
  clearAntigravityOnboardBackoff,
  clearAntigravityProjectCache,
  ensureAntigravityProjectAssigned,
  getAntigravityLoadCodeAssistUrls,
  getAntigravityProjectFromCache
};
