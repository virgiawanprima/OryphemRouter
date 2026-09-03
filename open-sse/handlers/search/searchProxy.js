import { saveCallLog } from "../../utils/omni/lib-usageDb.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { formatSearchProviderFailure } from "./providerFailure.js";
async function resolveSearchProxy(connectionId, apiKeyId, providerId) {
  if (!connectionId) {
    return { proxy: null, proxyLevel: "direct" };
  }
  try {
    const { resolveProxyForConnection } = await import("../../utils/omni/lib-db-settings.js");
    const proxyInfo = await resolveProxyForConnection(connectionId, apiKeyId, providerId);
    return { proxy: proxyInfo.proxy, proxyLevel: proxyInfo.level || "direct" };
  } catch {
    return { proxy: null, proxyLevel: "direct" };
  }
}
async function fetchWithSearchProxy(proxy, doFetch) {
  if (!proxy) return doFetch();
  const { runWithProxyContext } = await import("../../utils/omni/proxyFetchExtras.js");
  return runWithProxyContext(proxy, doFetch);
}
async function emitSearchProxyEvent(provider, connectionId, proxy, proxyLevel, targetUrl, startTime, status) {
  try {
    const { logProxyEvent } = await import("../../utils/omni/lib-proxyLogger.js");
    let targetOrigin = "";
    let targetPath = "";
    try {
      const u = new URL(targetUrl);
      targetOrigin = u.origin;
      targetPath = u.pathname;
    } catch {
      targetOrigin = targetUrl.slice(0, 80);
    }
    const proxyRecord = proxy && typeof proxy === "object" ? proxy : null;
    const proxyInfo = proxyRecord ? {
      type: String(proxyRecord.type || "http"),
      host: String(proxyRecord.host || ""),
      port: Number(proxyRecord.port || 0)
    } : null;
    logProxyEvent({
      status,
      proxy: proxyInfo,
      level: proxyLevel,
      levelId: connectionId || null,
      provider: provider || null,
      targetUrl: `${targetOrigin}${targetPath}`,
      latencyMs: Date.now() - startTime,
      connectionId: connectionId || null,
      account: connectionId ? connectionId.slice(0, 8) : null
    });
  } catch {
  }
}
async function executeProviderFetch(p) {
  const { config, url, init, controller, timer, query, searchType, maxResults, startTime } = p;
  const { connectionId, proxy, proxyLevel, log, normalize } = p;
  const emitEvent = (status) => emitSearchProxyEvent(config.id, connectionId, proxy, proxyLevel, url, startTime, status);
  const logCall = (fields) => saveCallLog({
    method: config.method,
    path: "/v1/search",
    model: config.id,
    provider: config.id,
    connectionId: connectionId || null,
    requestType: "search",
    requestBody: { query: query.slice(0, 200), search_type: searchType, max_results: maxResults },
    ...fields
  }).catch(() => {
  });
  try {
    const response = await fetchWithSearchProxy(
      proxy,
      () => fetch(url, { ...init, signal: controller.signal })
    );
    clearTimeout(timer);
    if (!response.ok) {
      const errorText = await response.text();
      if (log) {
        log.error("SEARCH", `${config.id} error ${response.status}: ${errorText.slice(0, 200)}`);
      }
      logCall({ status: response.status, duration: Date.now() - startTime, error: errorText.slice(0, 500) });
      await emitEvent("error");
      return {
        success: false,
        status: response.status,
        error: `Search provider ${config.id} returned ${response.status}`
      };
    }
    const data = await response.json();
    const normalized = normalize(config.id, data, query, searchType);
    const results = normalized.results.slice(0, maxResults);
    const duration = Date.now() - startTime;
    logCall({
      status: 200,
      duration,
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      responseBody: { results_count: results.length, cached: false }
    });
    await emitEvent("success");
    return {
      success: true,
      data: {
        provider: config.id,
        query,
        results,
        answer: null,
        usage: { queries_used: 1, search_cost_usd: config.costPerQuery },
        metrics: {
          response_time_ms: duration,
          upstream_latency_ms: duration,
          total_results_available: normalized.totalResults
        },
        errors: []
      }
    };
  } catch (err) {
    clearTimeout(timer);
    const error = err instanceof Error ? err : new Error(String(err));
    const isTimeout = error.name === "AbortError";
    const safeMsg = sanitizeErrorMessage(error.message) || "fetch failed";
    if (log) {
      log.error("SEARCH", `${config.id} ${isTimeout ? "timeout" : "fetch error"}: ${safeMsg}`);
    }
    logCall({ status: isTimeout ? 504 : 502, duration: Date.now() - startTime, error: safeMsg });
    await emitEvent(isTimeout ? "timeout" : "error");
    return formatSearchProviderFailure(config.id, error, isTimeout);
  }
}
export {
  emitSearchProxyEvent,
  executeProviderFetch,
  fetchWithSearchProxy,
  resolveSearchProxy
};
