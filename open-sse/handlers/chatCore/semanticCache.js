import {
  generateSignature,
  getCachedResponse,
  isCacheableForRead
} from "../../utils/omni/semanticCache.js";
import { calculateCost } from "../../utils/omni/costCalculator.js";
import { trackPendingRequest } from "../../utils/omni/usageDb.js";
import { synthesizeOpenAiSseFromJson } from "../../utils/jsonToSse.js";
import { attachOmniRouteMetaHeaders } from "../../utils/omni/omnirouteResponseMeta.js";
import { extractUsageFromResponse } from "../usageExtractor.js";
import { OMNIROUTE_RESPONSE_HEADERS } from "../../utils/omni/omniHeaders.js";
async function checkSemanticCache({
  semanticCacheEnabled,
  body,
  clientRawRequest,
  model,
  provider,
  stream,
  reqLogger,
  effectiveServiceTier,
  connectionId,
  startTime,
  log,
  persistAttemptLogs,
  apiKeyId,
  cacheDefaultMode
}) {
  if (cacheDefaultMode === "bypass") return null;
  if (semanticCacheEnabled && isCacheableForRead(body, clientRawRequest?.headers)) {
    const signature = generateSignature(
      model,
      body.messages ?? body.input,
      body.temperature,
      body.top_p,
      apiKeyId ?? void 0
    );
    const cached = getCachedResponse(signature);
    if (cached) {
      log?.debug?.("CACHE", `Semantic cache HIT for ${model} (stream=${stream})`);
      reqLogger.logConvertedResponse(cached);
      const cachedUsage = extractUsageFromResponse(cached, provider) || cached?.usage;
      const cachedCost = cachedUsage ? await calculateCost(provider, model, cachedUsage, {
        serviceTier: effectiveServiceTier
      }) : 0;
      persistAttemptLogs({
        status: 200,
        tokens: cached?.usage,
        responseBody: cached,
        providerRequest: null,
        providerResponse: null,
        clientResponse: cached,
        cacheSource: "semantic"
      });
      trackPendingRequest(model, provider, connectionId, false);
      const cachedSse = stream ? synthesizeOpenAiSseFromJson(JSON.stringify(cached)) : "";
      const headers = {
        "Content-Type": cachedSse ? "text/event-stream" : "application/json",
        [OMNIROUTE_RESPONSE_HEADERS.cache]: "HIT",
        // Marker for latency measurement tools: this response served from cache
        // has synthetic (near-zero) latency, not real upstream latency.
        [OMNIROUTE_RESPONSE_HEADERS.cacheLatency]: "synthetic"
      };
      attachOmniRouteMetaHeaders(headers, {
        provider,
        model,
        cacheHit: true,
        latencyMs: Date.now() - startTime,
        usage: cachedUsage,
        costUsd: 0,
        costSavedUsd: cachedCost
      });
      return {
        success: true,
        response: new Response(cachedSse || JSON.stringify(cached), {
          headers
        })
      };
    }
  }
  return null;
}
export {
  checkSemanticCache
};
