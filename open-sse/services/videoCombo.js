import { getComboByName, getCombos } from "../utils/omni/dbCombos.js";
import { resolveComboTargets } from "../utils/omni/comboResolveTargets.js";
import { getVideoProvider } from "../config/videoRegistry.js";
import { resolveVideoCredentialProvider } from "../utils/omni/videoGoogleFlow.js";
import {
  getProviderCredentialsWithQuotaPreflight,
  clearRecoveredProviderState
} from "../utils/omni/sseServicesAuth.js";
import { isAllRateLimitedCredentials } from "../utils/omni/apiRateLimit.js";
import { handleVideoGeneration } from "../handlers/videoGeneration.js";
import {
  isMediaGenerationFailure,
  promptRequiredResponse,
  successfulMediaGenerationResponse
} from "../utils/omni/mediaGenerationRoute.js";
import {
  isVideoPromptOptional,
  resolveLocalOverrideCredentials,
  resolveVideoModelTarget
} from "../utils/omni/videoModelResolution.js";
import { toJsonErrorPayload } from "../utils/omni/upstreamError.js";
import { HTTP_STATUS } from "../config/constants.js";
import { errorResponse } from "../utils/errorSanitize.js";
async function executeVideoCombo(comboName, body, auth, startTime, log) {
  const combo = await getComboByName(comboName);
  if (!combo) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Combo not found: ${comboName}`);
  }
  const allCombos = await getCombos();
  const targets = resolveComboTargets(combo, allCombos);
  if (!targets || targets.length === 0) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Combo "${comboName}" has no usable targets`);
  }
  const videoTargets = [];
  for (const t of targets) {
    if (!t.modelStr) continue;
    const resolved = await resolveVideoModelTarget(t.modelStr);
    if (resolved.provider) {
      videoTargets.push({ modelStr: t.modelStr, resolved });
    }
  }
  if (videoTargets.length === 0) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `No video-capable targets in combo "${comboName}"`
    );
  }
  let lastError = null;
  let fallbackCount = 0;
  for (const { modelStr, resolved } of videoTargets) {
    const { provider: targetProvider, model: targetModel, isCustomModel } = resolved;
    if (!targetProvider) {
      lastError = { status: 400, error: `Invalid video model: ${modelStr}` };
      fallbackCount += 1;
      continue;
    }
    if (!isVideoPromptOptional(resolved)) {
      const promptError = promptRequiredResponse(body);
      if (promptError) {
        lastError = { status: 400, error: `[${targetProvider}] Prompt is required` };
        fallbackCount += 1;
        continue;
      }
    }
    const providerConfig = getVideoProvider(targetProvider);
    let credentials = null;
    if (providerConfig && providerConfig.authType !== "none") {
      try {
        credentials = await getProviderCredentialsWithQuotaPreflight(
          resolveVideoCredentialProvider(targetProvider)
        );
      } catch {
        lastError = { status: 502, error: `Failed to resolve credentials for ${targetProvider}` };
        fallbackCount += 1;
        continue;
      }
      if (!credentials) {
        lastError = { status: 400, error: `No credentials for video provider: ${targetProvider}` };
        fallbackCount += 1;
        continue;
      }
      if (isAllRateLimitedCredentials(credentials)) {
        lastError = { status: 429, error: `[${targetProvider}] All accounts rate limited` };
        fallbackCount += 1;
        continue;
      }
    } else if (isCustomModel) {
      try {
        credentials = await getProviderCredentialsWithQuotaPreflight(
          targetProvider,
          null,
          null,
          targetModel
        );
      } catch {
        lastError = { status: 502, error: `Failed to resolve credentials for ${targetProvider}` };
        fallbackCount += 1;
        continue;
      }
      if (!credentials) {
        lastError = {
          status: 400,
          error: `No credentials for custom video provider: ${targetProvider}`
        };
        fallbackCount += 1;
        continue;
      }
      if (isAllRateLimitedCredentials(credentials)) {
        lastError = { status: 429, error: `[${targetProvider}] All accounts rate limited` };
        fallbackCount += 1;
        continue;
      }
    } else if (providerConfig?.authType === "none") {
      credentials = await resolveLocalOverrideCredentials(targetProvider);
    }
    const result = await handleVideoGeneration({
      body: { ...body, model: modelStr },
      credentials,
      log,
      ...isCustomModel && { resolvedProvider: targetProvider }
    });
    if (!isMediaGenerationFailure(result)) {
      await clearRecoveredProviderState(credentials);
      return successfulMediaGenerationResponse({
        result: { data: result.data },
        billingMode: "video",
        provider: targetProvider,
        model: modelStr,
        startTime,
        duration: body.duration,
        strategy: "priority",
        fallbackAttempts: fallbackCount
      });
    }
    const status = result.status || 500;
    const error = typeof result.error === "string" ? result.error : "Video generation failed";
    if (status === 400 || status === 401 || status === 403) {
      return errorResponse(status, `[${targetProvider}] ${error}`);
    }
    lastError = { status, error: `[${targetProvider}] ${error}` };
    fallbackCount += 1;
  }
  const errorPayload = toJsonErrorPayload(
    lastError?.error || "All combo targets failed",
    "Video combo targets all failed"
  );
  return new Response(JSON.stringify(errorPayload), {
    status: lastError?.status || 502,
    headers: { "Content-Type": "application/json" }
  });
}
export {
  executeVideoCombo
};
