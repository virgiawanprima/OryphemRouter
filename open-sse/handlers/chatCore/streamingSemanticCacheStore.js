import {
  generateSignature as defaultGenerateSignature,
  setCachedResponse as defaultSetCachedResponse,
  isCacheableForWrite as defaultIsCacheableForWrite
} from "../../utils/omni/semanticCache.js";
import { isSmallEnoughForSemanticCache as defaultIsSmallEnough } from "../../utils/estimateSize.js";
const DEFAULT_DEPS = {
  isCacheableForWrite: defaultIsCacheableForWrite,
  isSmallEnoughForSemanticCache: defaultIsSmallEnough,
  generateSignature: defaultGenerateSignature,
  setCachedResponse: defaultSetCachedResponse
};
function streamTokensSaved(streamUsage) {
  const u = streamUsage;
  return (Number(u?.prompt_tokens ?? 0) || 0) + (Number(u?.completion_tokens ?? 0) || 0);
}
function writeStreamingCacheEntry(args, deps) {
  try {
    const cleanBody = { ...args.streamResponseBody };
    delete cleanBody._streamed;
    if (!deps.isSmallEnoughForSemanticCache(cleanBody)) return;
    const sig = deps.generateSignature(
      args.model,
      args.body.messages ?? args.body.input,
      args.body.temperature,
      args.body.top_p,
      args.apiKeyId ?? void 0
    );
    const tokensSaved = streamTokensSaved(args.streamUsage);
    deps.setCachedResponse(sig, args.model, cleanBody, tokensSaved);
    args.log?.debug?.(
      "CACHE",
      `Stored streaming response for ${args.model} (${tokensSaved} tokens)`
    );
  } catch {
  }
}
function storeStreamingSemanticCacheResponse(args, deps = DEFAULT_DEPS) {
  if (!args.enabled || args.streamStatus !== 200 || !args.streamResponseBody || !deps.isCacheableForWrite(args.body, args.headers)) {
    return;
  }
  writeStreamingCacheEntry(args, deps);
}
export {
  storeStreamingSemanticCacheResponse
};
