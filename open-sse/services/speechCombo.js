import { getComboByName, getCombos } from "../utils/omni/dbCombos.js";
import { resolveComboTargets } from "../utils/omni/comboResolveTargets.js";
import { parseSpeechModel, getSpeechProvider } from "../config/audioRegistry.js";
import { resolveDynamicAudioProviders } from "../utils/omni/audioProviderNodes.js";
import {
  getProviderCredentialsWithQuotaPreflight,
  clearRecoveredProviderState
} from "../utils/omni/sseServicesAuth.js";
import { isAllRateLimitedCredentials } from "../utils/omni/apiRateLimit.js";
import { handleAudioSpeech } from "../handlers/audioSpeech.js";
import { attachOmniRouteMetaToResponse } from "../utils/omni/omnirouteResponseMeta.js";
import { generateRequestId } from "../utils/omni/requestId.js";
import { calculateModalCost } from "../utils/omni/costCalculator.js";
import { getClientIpFromRequest } from "../utils/omni/ipUtils.js";
import { toJsonErrorPayload } from "../utils/omni/upstreamError.js";
import { HTTP_STATUS } from "../config/constants.js";
import { errorResponse } from "../utils/errorSanitize.js";
async function executeSpeechCombo(comboName, body, auth, startTime) {
  const combo = await getComboByName(comboName);
  if (!combo) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Combo not found: ${comboName}`);
  }
  const allCombos = await getCombos();
  const targets = resolveComboTargets(combo, allCombos);
  if (!targets || targets.length === 0) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Combo "${comboName}" has no usable targets`);
  }
  const dynamicProviders = await resolveDynamicAudioProviders("/audio/speech", "audio-speech");
  const speechTargets = targets.filter((t) => {
    if (!t.modelStr) return false;
    const { provider, model } = parseSpeechModel(t.modelStr, dynamicProviders);
    if (!provider) return false;
    const config = getSpeechProvider(provider) || dynamicProviders.find((dp) => dp.id === provider) || null;
    if (!config) return false;
    if (!Array.isArray(config.models) || config.models.length === 0) return true;
    return config.models.some((m) => m.id === model || m.id === t.modelStr);
  });
  if (speechTargets.length === 0) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `No speech-capable targets in combo "${comboName}"`
    );
  }
  const clientIp = getClientIpFromRequest(auth.request);
  let lastError = null;
  let fallbackCount = 0;
  for (const target of speechTargets) {
    const { provider: targetProvider, model: resolvedModel } = parseSpeechModel(
      target.modelStr,
      dynamicProviders
    );
    if (!targetProvider) {
      lastError = { status: 400, error: `Invalid speech model: ${target.modelStr}` };
      fallbackCount += 1;
      continue;
    }
    const providerConfig = getSpeechProvider(targetProvider) || dynamicProviders.find((dp) => dp.id === targetProvider) || null;
    let credentials = null;
    if (providerConfig && providerConfig.authType !== "none") {
      const credentialKey = providerConfig.credentialProviderId || targetProvider;
      try {
        credentials = await getProviderCredentialsWithQuotaPreflight(credentialKey);
      } catch {
        lastError = { status: 502, error: `Failed to resolve credentials for ${targetProvider}` };
        fallbackCount += 1;
        continue;
      }
      if (!credentials) {
        lastError = { status: 400, error: `No credentials for provider: ${targetProvider}` };
        fallbackCount += 1;
        continue;
      }
      if (isAllRateLimitedCredentials(credentials)) {
        lastError = { status: 429, error: `[${targetProvider}] All accounts rate limited` };
        fallbackCount += 1;
        continue;
      }
    }
    const response = await handleAudioSpeech({
      body: { ...body, model: target.modelStr },
      credentials,
      resolvedProvider: providerConfig,
      resolvedModel,
      clientIp
    });
    if (response?.ok) {
      await clearRecoveredProviderState(credentials);
      const characters = typeof body.input === "string" ? body.input.length : 0;
      const costUsd = await calculateModalCost(
        "audio",
        targetProvider,
        resolvedModel || target.modelStr,
        { characters }
      );
      return attachOmniRouteMetaToResponse(response, {
        provider: targetProvider,
        model: resolvedModel || target.modelStr,
        costUsd,
        latencyMs: Date.now() - startTime,
        requestId: generateRequestId(),
        strategy: "priority",
        fallbackAttempts: fallbackCount
      });
    }
    const status = response?.status || 500;
    let error = `Speech generation failed (HTTP ${status})`;
    try {
      const text = await response?.clone().text();
      if (text) error = text.slice(0, 300);
    } catch {
    }
    if (status === 400 || status === 401 || status === 403) {
      return errorResponse(status, `[${targetProvider}] ${error}`);
    }
    lastError = { status, error: `[${targetProvider}] ${error}` };
    fallbackCount += 1;
  }
  const errorPayload = toJsonErrorPayload(
    lastError?.error || "All combo targets failed",
    "Speech combo targets all failed"
  );
  return new Response(JSON.stringify(errorPayload), {
    status: lastError?.status || 502,
    headers: { "Content-Type": "application/json" }
  });
}
export {
  executeSpeechCombo
};
