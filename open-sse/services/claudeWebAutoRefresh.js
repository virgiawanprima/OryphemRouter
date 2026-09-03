import { getCfClearanceToken, getCacheStatus } from "./claudeTurnstileSolver.js";
function injectCfClearance(existingCookie, cfClearanceToken) {
  if (!existingCookie || !existingCookie.trim()) {
    return `cf_clearance=${cfClearanceToken}`;
  }
  if (existingCookie.includes("cf_clearance=")) {
    return existingCookie.replace(/cf_clearance=[^;]+/, `cf_clearance=${cfClearanceToken}`);
  }
  return `${existingCookie.trim()}; cf_clearance=${cfClearanceToken}`;
}
async function refreshCookie(existingCookie, options) {
  const { force = false, log } = options || {};
  try {
    log?.info?.("CLAUDE-WEB-AUTO-REFRESH", "Fetching fresh cf_clearance...");
    const cfClearanceToken = await getCfClearanceToken({ force });
    const newCookie = injectCfClearance(existingCookie, cfClearanceToken);
    log?.info?.("CLAUDE-WEB-AUTO-REFRESH", "cf_clearance token injected successfully");
    return {
      cookie: newCookie,
      cfClearanceInjected: true,
      attempt: 1
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.error?.("CLAUDE-WEB-AUTO-REFRESH", `Failed to refresh cf_clearance: ${message}`);
    throw error;
  }
}
function getCacheInfo() {
  const status = getCacheStatus();
  if (!status.hasCached) {
    return {
      hasCached: false,
      message: "No cached cf_clearance"
    };
  }
  const minutes = Math.floor((status.expiresIn || 0) / 6e4);
  const seconds = Math.floor((status.expiresIn || 0) % 6e4 / 1e3);
  return {
    hasCached: true,
    expiresIn: status.expiresIn,
    message: `cf_clearance cached: expires in ${minutes}m${seconds}s`
  };
}
async function fetchWithAutoRefresh(fetchFn, initialCookie, options) {
  const maxRetries = options?.maxRetries ?? 2;
  let attempt = 0;
  let currentCookie = initialCookie;
  let lastError = null;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await fetchFn(currentCookie);
      return {
        result,
        cookie: currentCookie,
        refreshed: attempt > 1
      };
    } catch (error) {
      lastError = error;
      const isAuthError = lastError.message?.includes("403") || lastError.message?.includes("401");
      if (!isAuthError || attempt >= maxRetries) {
        throw lastError;
      }
      options?.log?.warn?.(
        "CLAUDE-WEB-AUTO-REFRESH",
        `Auth error detected (attempt ${attempt}/${maxRetries}), refreshing cf_clearance...`
      );
      try {
        const refresh = await refreshCookie(currentCookie, {
          ...options,
          force: attempt > 1
        });
        currentCookie = refresh.cookie;
      } catch (refreshError) {
        options?.log?.error?.("CLAUDE-WEB-AUTO-REFRESH", "Refresh failed");
        throw refreshError;
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}
function createAutoRefreshMiddleware(options) {
  return async (fetch, url, init) => {
    const { log = options?.log } = options || {};
    const originalCookie = init?.headers?.Cookie || "";
    let currentCookie = originalCookie;
    let attempt = 0;
    const maxRetries = options?.maxRetries ?? 2;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            Cookie: currentCookie
          }
        });
        if (response.status === 200) {
          return response;
        }
        if ((response.status === 403 || response.status === 401) && attempt < maxRetries) {
          log?.warn?.(
            "CLAUDE-WEB-AUTO-REFRESH",
            `HTTP ${response.status} - refreshing cf_clearance (attempt ${attempt}/${maxRetries})`
          );
          try {
            const refresh = await refreshCookie(currentCookie, {
              ...options,
              force: attempt > 1,
              log
            });
            currentCookie = refresh.cookie;
            continue;
          } catch (error) {
            log?.error?.("CLAUDE-WEB-AUTO-REFRESH", "Refresh failed, returning error response");
            return response;
          }
        }
        return response;
      } catch (error) {
        if (attempt >= maxRetries) {
          throw error;
        }
        log?.error?.(
          "CLAUDE-WEB-AUTO-REFRESH",
          `Fetch failed: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    }
    throw new Error("Max retries exceeded");
  };
}
export {
  createAutoRefreshMiddleware,
  fetchWithAutoRefresh,
  getCacheInfo,
  injectCfClearance,
  refreshCookie
};
