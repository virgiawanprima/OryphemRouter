import { OMNIROUTE_RESPONSE_HEADERS } from "../../utils/omni/omniHeaders.js";
import { buildStreamingResponseHeaders as defaultBuildStreaming } from "./responseHeaders.js";
function assembleStreamingResponseHeaders(args, buildStreamingResponseHeaders = defaultBuildStreaming) {
  const responseHeaders = {
    ...buildStreamingResponseHeaders(args.providerHeaders, {
      provider: args.provider,
      model: args.model,
      cacheHit: false,
      latencyMs: 0,
      usage: null,
      costUsd: 0,
      strategy: args.comboStrategy ?? "single"
    }),
    "x-omniroute-request-id": args.pendingRequestId
  };
  if (args.compressionResponseMeta) {
    responseHeaders[OMNIROUTE_RESPONSE_HEADERS.compression] = args.compressionResponseMeta;
  }
  return responseHeaders;
}
export {
  assembleStreamingResponseHeaders
};
