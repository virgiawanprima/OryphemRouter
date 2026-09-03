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
function storeSemanticCacheResponse(args, deps = DEFAULT_DEPS) {
  if (!args.enabled || !deps.isCacheableForWrite(args.body, args.headers) || !deps.isSmallEnoughForSemanticCache(args.translatedResponse)) {
    return;
  }
  const signature = deps.generateSignature(
    args.model,
    args.body.messages ?? args.body.input,
    args.body.temperature,
    args.body.top_p,
    args.apiKeyId ?? void 0
  );
  const tokensSaved = args.usage?.prompt_tokens + args.usage?.completion_tokens || 0;
  deps.setCachedResponse(signature, args.model, args.translatedResponse, tokensSaved);
  args.log?.debug?.("CACHE", `Stored response for ${args.model} (${tokensSaved} tokens)`);
}
export {
  storeSemanticCacheResponse
};
