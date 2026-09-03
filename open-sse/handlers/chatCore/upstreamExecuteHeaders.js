import { getModelUpstreamExtraHeaders } from "../../utils/omni/dbModels.js";
import { resolveModelAlias } from "../../utils/omni/modelDeprecation.js";
import { CPA_FORCE_FAST_MODE_HEADER, shouldRequestClaudeFastMode } from "../../utils/omni/claudeFastMode.js";
import { isForbiddenCustomHeaderName } from "../../utils/omni/upstreamHeaders.js";
function buildUpstreamHeadersForExecute(opts) {
  const {
    modelToCall,
    effectiveModel,
    provider,
    model,
    resolvedModel,
    sourceFormat,
    connectionCustomUserAgent,
    connectionCustomHeaders,
    settings
  } = opts;
  const upstreamHeaders = modelToCall === effectiveModel ? {
    ...getModelUpstreamExtraHeaders(provider || "", model || "", sourceFormat),
    ...getModelUpstreamExtraHeaders(provider || "", resolvedModel || "", sourceFormat)
  } : (() => {
    const r = resolveModelAlias(modelToCall);
    return {
      ...getModelUpstreamExtraHeaders(provider || "", modelToCall || "", sourceFormat),
      ...getModelUpstreamExtraHeaders(provider || "", r || "", sourceFormat)
    };
  })();
  if (connectionCustomUserAgent) {
    upstreamHeaders["User-Agent"] = connectionCustomUserAgent;
    if ("user-agent" in upstreamHeaders) {
      upstreamHeaders["user-agent"] = connectionCustomUserAgent;
    }
  }
  if (connectionCustomHeaders) {
    for (const [key, value] of Object.entries(connectionCustomHeaders)) {
      const keyLower = key.trim().toLowerCase();
      if (!keyLower) continue;
      if (isForbiddenCustomHeaderName(key)) continue;
      const existingKey = Object.keys(upstreamHeaders).find(
        (k) => k.toLowerCase() === keyLower
      );
      if (!existingKey) {
        upstreamHeaders[key] = value;
      }
    }
  }
  if (provider === "claude" && typeof settings !== "undefined" && shouldRequestClaudeFastMode(settings, modelToCall)) {
    upstreamHeaders[CPA_FORCE_FAST_MODE_HEADER] = "1";
  }
  return upstreamHeaders;
}
export {
  buildUpstreamHeadersForExecute
};
