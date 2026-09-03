import { createHash } from "node:crypto";
import { getIdempotencyKey, checkIdempotency } from "../../utils/omni/idempotencyLayer.js";
import { calculateCost } from "../../utils/omni/costCalculator.js";
import { attachOmniRouteMetaHeaders } from "../../utils/omni/omnirouteResponseMeta.js";
function composeIdempotencyKey({
  rawKey,
  provider,
  model,
  messages
}) {
  if (!rawKey) return null;
  let digest = "";
  try {
    digest = createHash("sha256").update(JSON.stringify(messages ?? "")).digest("hex").slice(0, 16);
  } catch {
    digest = "nodigest";
  }
  return `${rawKey}|${provider}|${model}|${digest}`;
}
async function checkIdempotencyCache({
  clientRawRequest,
  provider,
  model,
  body,
  effectiveServiceTier,
  startTime,
  log
}) {
  const rawIdempotencyKey = getIdempotencyKey(clientRawRequest?.headers);
  const idempotencyKey = composeIdempotencyKey({
    rawKey: rawIdempotencyKey,
    provider,
    model,
    messages: body?.messages
  });
  const cachedIdemp = checkIdempotency(idempotencyKey);
  if (cachedIdemp) {
    log?.debug?.("IDEMPOTENCY", `Hit for key=${idempotencyKey?.slice(0, 12)}...`);
    const idempotentUsage = cachedIdemp.response && typeof cachedIdemp.response === "object" ? cachedIdemp.response.usage : void 0;
    const idempotentCost = idempotentUsage ? await calculateCost(provider, model, idempotentUsage, {
      serviceTier: effectiveServiceTier
    }) : 0;
    const headers = {
      "Content-Type": "application/json",
      "X-OmniRoute-Idempotent": "true"
    };
    attachOmniRouteMetaHeaders(headers, {
      provider,
      model,
      cacheHit: false,
      latencyMs: Date.now() - startTime,
      usage: idempotentUsage,
      costUsd: idempotentCost
    });
    return {
      idempotencyKey,
      hit: {
        success: true,
        response: new Response(JSON.stringify(cachedIdemp.response), {
          status: cachedIdemp.status,
          headers
        })
      }
    };
  }
  return { hit: null, idempotencyKey };
}
export {
  checkIdempotencyCache,
  composeIdempotencyKey
};
