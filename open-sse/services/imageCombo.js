import { getComboByName, getCombos } from "../utils/omni/dbCombos.js";
import { resolveComboTargets } from "../utils/omni/comboResolveTargets.js";
import { getImageModelEntry, parseImageModel } from "../config/imageRegistry.js";
import {
  getProviderCredentialsWithQuotaPreflight,
  clearRecoveredProviderState
} from "../utils/omni/sseServicesAuth.js";
import { isAllRateLimitedCredentials } from "../utils/omni/apiRateLimit.js";
import { handleImageGeneration } from "../handlers/imageGeneration.js";
import { attachOmniRouteMetaHeaders } from "../utils/omni/omnirouteResponseMeta.js";
import { generateRequestId } from "../utils/omni/requestId.js";
import { calculateModalCost } from "../utils/omni/costCalculator.js";
import { toJsonErrorPayload } from "../utils/omni/upstreamError.js";
import { HTTP_STATUS } from "../config/constants.js";
import { errorResponse } from "../utils/errorSanitize.js";
async function executeImageCombo(comboName, body, auth, startTime, log) {
  const combo = await getComboByName(comboName);
  if (!combo) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `Combo not found: ${comboName}`
    );
  }
  const allCombos = await getCombos();
  const targets = resolveComboTargets(combo, allCombos);
  if (!targets || targets.length === 0) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `Combo "${comboName}" has no usable targets`
    );
  }
  const imageTargets = targets.filter((t) => {
    if (!t.modelStr) return false;
    const entry = getImageModelEntry(t.modelStr);
    return entry !== null;
  });
  if (imageTargets.length === 0) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `No images-capable targets in combo "${comboName}"`
    );
  }
  let lastError = null;
  let successResult = null;
  let fallbackCount = 0;
  let selectedProvider = "";
  let selectedModel = "";
  for (const target of imageTargets) {
    const { provider: targetProvider, model: targetModel } = parseImageModel(target.modelStr);
    if (!targetProvider) {
      lastError = { status: 400, error: `Invalid image model: ${target.modelStr}` };
      fallbackCount += 1;
      continue;
    }
    let credentials = null;
    try {
      credentials = await getProviderCredentialsWithQuotaPreflight(targetProvider);
    } catch {
      lastError = { status: 502, error: `Failed to resolve credentials for ${targetProvider}` };
      fallbackCount += 1;
      continue;
    }
    if (!credentials) {
      lastError = { status: 400, error: `No credentials for image provider: ${targetProvider}` };
      fallbackCount += 1;
      continue;
    }
    if (isAllRateLimitedCredentials(credentials)) {
      lastError = {
        status: 429,
        error: `[${targetProvider}] All accounts rate limited`
      };
      fallbackCount += 1;
      continue;
    }
    const result = await handleImageGeneration({
      body: { ...body, model: target.modelStr },
      credentials,
      log,
      signal: auth.request?.signal || null
    });
    if (result.success) {
      await clearRecoveredProviderState(credentials);
      selectedProvider = targetProvider;
      selectedModel = target.modelStr;
      successResult = {
        data: result.data,
        provider: targetProvider,
        model: target.modelStr
      };
      break;
    }
    const status = result.status || 500;
    const error = typeof result.error === "string" ? result.error : "Image generation failed";
    if (status === 400 || status === 403 || status === 401) {
      return errorResponse(
        status,
        `[${targetProvider}] ${error}`
      );
    }
    lastError = { status, error: `[${targetProvider}] ${error}` };
    fallbackCount += 1;
  }
  if (successResult) {
    const n = Math.max(
      Number(body.n) || 1,
      successResult.data.data?.data?.length || 0
    );
    const costUsd = await calculateModalCost(
      "image",
      selectedProvider,
      selectedModel,
      { n }
    );
    const headers = new Headers({ "Content-Type": "application/json" });
    attachOmniRouteMetaHeaders(headers, {
      provider: selectedProvider,
      model: selectedModel,
      costUsd,
      latencyMs: Date.now() - startTime,
      requestId: generateRequestId(),
      strategy: "priority",
      fallbackAttempts: fallbackCount
    });
    return new Response(
      JSON.stringify(successResult.data.data),
      { status: 200, headers }
    );
  }
  const errorPayload = toJsonErrorPayload(
    lastError?.error || "All combo targets failed",
    "Image combo targets all failed"
  );
  return new Response(JSON.stringify(errorPayload), {
    status: lastError?.status || 502,
    headers: { "Content-Type": "application/json" }
  });
}
export {
  executeImageCombo
};
