import { OMNIROUTE_RESPONSE_HEADERS } from "../../utils/omni/omniHeaders.js";
import { attachOmniRouteMetaHeaders as defaultAttachMeta } from "../../utils/omni/omnirouteResponseMeta.js";
function buildNonStreamingResponseHeaders(args, deps = {
  attachOmniRouteMetaHeaders: defaultAttachMeta,
  now: Date.now
}) {
  const responseHeaders = {
    "Content-Type": "application/json",
    [OMNIROUTE_RESPONSE_HEADERS.cache]: "MISS"
  };
  deps.attachOmniRouteMetaHeaders(responseHeaders, {
    provider: args.provider,
    model: args.model,
    cacheHit: false,
    latencyMs: deps.now() - args.startTime,
    usage: args.responseUsage,
    costUsd: args.estimatedCost,
    requestId: args.requestId,
    strategy: args.comboStrategy ?? "single"
  });
  if (args.compressionResponseMeta) {
    responseHeaders[OMNIROUTE_RESPONSE_HEADERS.compression] = args.compressionResponseMeta;
  }
  return responseHeaders;
}
export {
  buildNonStreamingResponseHeaders
};
