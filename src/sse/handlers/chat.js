import { parseJson } from "@/lib/utils/parseJson";
import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getComboByName, updateCombo } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { getTransform as getPxpipeTransform } from "@/lib/pxpipe/loader.js";
import { appendPxpipeEvent } from "@/lib/pxpipe/events.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat, handleFusionChat, handlePipelineChat, detectRequiredCapabilities } from "open-sse/services/combo.js";
import { promoteSuccessfulComboModel } from "open-sse/services/autoPromote.js";
import { augmentModelsWithCapacityAdapter, withCapacityAdapterStripping, getActiveAdapterStrategy } from "open-sse/services/capacityAdapter.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import { checkRateLimit } from "@/lib/auth/apiRateLimiter";
import { getSpendingLimitsCache, getSpendingLimitsCacheTtlMs } from "../services/spendingCache.js";
import {
  generateSignature,
  getCachedResponse,
  setCachedResponse,
  isCacheableForRead,
} from "../services/semanticCache.js";

// H6: In-memory cache for spending-limit queries to avoid two full-history
// queries (getUsageStats("30d") + getUsageStats("today")) on every chat request.
// The cache lives in ../services/spendingCache.js so usage recording and the
// settings route can invalidate it without importing this handler.

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 *
 * @param {Request} request
 * @param {object|null} clientRawRequest
 * @param {object} [opts] - { skipApiKeyCheck?: boolean } — the internal dashboard
 *   Basic Chat already passed the dashboard auth gate, so it does not need a
 *   router API key (it uses the configured provider credentials).
 */
export async function handleChat(request, clientRawRequest = null, opts = {}) {
  // Per-IP rate limiting (generous 120 req/min — never trips normal usage).
  const rate = checkRateLimit(request, { windowMs: 60_000, max: 120 });
  if (!rate.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
    log.warn("RATE", `Rate limit exceeded for client (retry in ${retryAfterSec}s)`);
    return new Response(
      JSON.stringify({ error: { message: "Rate limit exceeded, please slow down" } }),
      {
        status: HTTP_STATUS.RATE_LIMITED,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Retry-After": String(retryAfterSec),
        },
      }
    );
  }

  let body;
  try {
    body = await parseJson(request);
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  const modelStr = body.model;

  // Request summary is emitted as the unified "▶" line in chatCore (has fmt/thinking/account)

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings. The internal dashboard Basic Chat
  // bypasses this — it already passed the dashboard auth gate and uses the
  // configured provider credentials instead of a router API key.
  const settings = await getSettings();
  if (settings.requireApiKey && !opts?.skipApiKeyCheck) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // Spending limits enforcement
  // TODO(H6): getUsageStats("30d") and getUsageStats("today") each scan the
  // entire usageDaily table or full usageHistory window. Cache results with
  // TTL ~15s to avoid two full-history queries per chat request. See the
  // spendingLimitsCache Map in ../services/spendingCache.js.
  const spendingLimits = settings.spendingLimits || {};
  if (spendingLimits.maxCostPerMonth || spendingLimits.maxCostPerDay) {
    // Key on the actual limit config (settings.id is never populated), so
    // different limit configurations never collide in the shared Map.
    const cacheKey = JSON.stringify(spendingLimits);
    const spendingLimitsCache = getSpendingLimitsCache();
    let cached = spendingLimitsCache.get(cacheKey);
    if (!cached || Date.now() - cached.ts > getSpendingLimitsCacheTtlMs()) {
      const { getUsageStats } = await import("@/lib/usageDb");
      const [monthlyStats, dailyStats] = await Promise.all([
        getUsageStats("30d"),
        getUsageStats("today"),
      ]);
      cached = {
        monthly: { totalCost: monthlyStats?.totalCost || 0 },
        daily: { totalCost: dailyStats?.totalCost || 0 },
        ts: Date.now(),
      };
      spendingLimitsCache.set(cacheKey, cached);
    }
    const totalMonthCost = cached.monthly.totalCost;
    const totalDayCost = cached.daily.totalCost;

    const maxMonth = parseFloat(spendingLimits.maxCostPerMonth) || 0;
    const maxDay = parseFloat(spendingLimits.maxCostPerDay) || 0;

    if (maxMonth && totalMonthCost >= maxMonth) {
      if (spendingLimits.autoPause !== false) {
        log.warn("LIMIT", `Monthly spending limit reached (${totalMonthCost.toFixed(2)} >= ${maxMonth.toFixed(2)})`);
        if (spendingLimits.fallbackToFree !== false) {
          // Allow request but flag for free-only routing
          body._spendingLimitExceeded = true;
        } else {
          return errorResponse(HTTP_STATUS.FORBIDDEN, `Monthly spending limit reached. Please increase your limit or wait for reset.`);
        }
      }
    }

    if (maxDay && totalDayCost >= maxDay) {
      if (spendingLimits.autoPause !== false) {
        log.warn("LIMIT", `Daily spending limit reached (${totalDayCost.toFixed(2)} >= ${maxDay.toFixed(2)})`);
        if (spendingLimits.fallbackToFree !== false) {
          body._spendingLimitExceeded = true;
        } else {
          return errorResponse(HTTP_STATUS.FORBIDDEN, `Daily spending limit reached. Please increase your limit or wait for reset.`);
        }
      }
    }
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  const requiredCapabilities = detectRequiredCapabilities(body);

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
    const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, settings);
    const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

    if (comboStrategy === "pipeline") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: pipeline)`);
      return handlePipelineChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest || {}, request, apiKey),
        log,
        comboName: modelStr,
      });
    }

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, isPanel, signal) => {
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, signal);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
      });
    }

    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
    log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      models: augmentedModels,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit,
      onModelSuccess: async (winningModel) => {
        // Opt-in auto-promote: move the winning combo model to position #1.
        try {
          const combo = await getComboByName(modelStr);
          await promoteSuccessfulComboModel(combo, winningModel, settings, {
            updateCombo,
            info: (tag, msg) => log.info(tag, msg),
            warn: (tag, msg) => log.warn(tag, msg),
          });
        } catch { /* best-effort; never affects the response */ }
      },
    });
  }

  // Single model request — may still switch to a capacity-adapter model if the
  // target lacks a capability the request needs (e.g. no vision, request has an image).
  const soloAugmented = augmentModelsWithCapacityAdapter([modelStr], requiredCapabilities, settings);
  if (soloAugmented.length > 1) {
    const adapterAdded = soloAugmented.filter((m) => m !== modelStr);
    log.info("CHAT", `Capacity adapter for [${[...requiredCapabilities].join(",")}] on "${modelStr}" → trying ${soloAugmented.join(", ")}`);
    return handleComboChat({
      body,
      models: soloAugmented,
      handleSingleModel: withCapacityAdapterStripping(
        (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
        adapterAdded
      ),
      log,
      comboName: modelStr,
      comboStrategy: getActiveAdapterStrategy(requiredCapabilities, settings)
    });
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey);
}

/**
 * Handle single model chat request
 */
// Store a non-streaming JSON response in the semantic cache (opt-in).
async function maybeCacheSemanticResponse(body, modelStr, response, apiKey) {
  if (!response) return;
  const { semanticCacheEnabled } = await getSettings();
  if (!semanticCacheEnabled) return;
  const headers = response.headers;
  const contentType = headers?.get?.("content-type") || "";
  if (!contentType.includes("application/json")) return;
  const signature = generateSignature(modelStr, body.messages ?? body.input, body.temperature, body.top_p ?? 1, apiKey || undefined);
  const text = await response.clone().text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  // Rough token-saved proxy (byte length). Accurate token accounting lives in
  // the usage layer; this value is only surfaced in cache stats / headers.
  const tokensSaved = text.length;
  setCachedResponse(signature, modelStr, parsed, tokensSaved);
  log.debug("CACHE", `semantic cache stored for ${modelStr}`);
}

async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, signal = null) {
  let modelInfo;
  try {
    modelInfo = await getModelInfo(modelStr);
  } catch (e) {
    log.warn("CHAT", "Model resolution failed", { error: e?.message });
    return errorResponse(e?.status || HTTP_STATUS.BAD_REQUEST, e?.message || "Invalid model");
  }

  // Semantic cache (opt-in): deterministic temperature=0 non-streaming requests
  // may be answered from cache. Full result shape (incl. cache => HIT) is only
  // returned for genuinely cache-ready requests; every other path is untouched.
  const isPlainModel = modelInfo && modelInfo.provider;
  const wantCache = isPlainModel && body && body.stream === false && typeof body.temperature === "number" && body.temperature === 0;
  if (wantCache) {
    const { semanticCacheEnabled } = await getSettings();
    if (semanticCacheEnabled) {
      const cacheHeaders = clientRawRequest?.headers || null;
      if (isCacheableForRead(body, cacheHeaders)) {
        const cacheSignature = generateSignature(modelStr, body.messages ?? body.input, body.temperature, body.top_p ?? 1, apiKey || undefined);
        const cached = getCachedResponse(cacheSignature);
        if (cached) {
          log.debug("CACHE", `semantic cache HIT for ${modelStr}`);
          return new Response(JSON.stringify(cached.response), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "x-oryphemrouter-cache": "HIT",
              "x-oryphemrouter-cache-tokens-saved": String(cached.tokensSaved || 0),
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
    }
  }

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
      const requiredCapabilities = detectRequiredCapabilities(body);
      const augmentedModels = augmentModelsWithCapacityAdapter(comboModels, requiredCapabilities, chatSettings);
      const adapterAdded = augmentedModels.filter((m) => !comboModels.includes(m));

      if (comboStrategy === "pipeline") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: pipeline)`);
        return handlePipelineChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
          log,
          comboName: modelStr,
        });
      }

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, isPanel, signal) => {
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey, signal);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
        });
      }

      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
      log.info("CHAT", `Combo "${modelStr}" with ${augmentedModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: augmentedModels,
        handleSingleModel: withCapacityAdapterStripping(
          (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
          adapterAdded
        ),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Routing shown in the unified "▶" line (client model → provider/model)

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn("CHAT", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    // Account selection shown in the unified "▶" line (acc:...)
    let refreshedCredentials;
    try {
      refreshedCredentials = await checkAndRefreshToken(provider, credentials);
    } catch (refreshErr) {
      log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} TOKEN REFRESH FAILED → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = refreshErr?.message || "Token refresh failed";
      lastStatus = HTTP_STATUS.UNAUTHORIZED;
      continue;
    }

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken, provider);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      signal,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      headroomEnabled: !!chatSettings.headroomEnabled,
      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      pxpipeEnabled: !!chatSettings.pxpipeEnabled,
      pxpipeMinChars: chatSettings.pxpipeMinChars,
      pxpipeTimeoutMs: chatSettings.pxpipeTimeoutMs,
      // Lazily warms the in-process module on first use; null when not installed (fail-open)
      pxpipeTransform: chatSettings.pxpipeEnabled ? await getPxpipeTransform() : null,
      onPxpipeEvent: appendPxpipeEvent,
      providerThinking,
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      onCredentialsRefreshed: async (newCreds) => {
        try {
          await updateProviderCredentials(credentials.connectionId, {
            ...newCreds,
            existingProviderSpecificData: credentials.providerSpecificData,
            testStatus: "active"
          });
        } catch (err) {
          log.warn("CHAT", "Failed to persist refreshed credentials", { error: err?.message });
        }
      },
      onRequestSuccess: async () => {
        // Stale: this panel call timed out and the fusion response is already on
        // its way to the client — don't clear breaker state from a result nobody used.
        if (signal?.aborted) return;
        try {
          await clearAccountError(credentials.connectionId, credentials, model);
        } catch (err) {
          log.warn("CHAT", "Failed to clear account error on success", { error: err?.message });
        }
      }
    });

    if (result.success) {
      // Semantic cache write (opt-in): only non-streaming, temperature=0,
      // direct single-model successes whose response body is JSON we can replay.
      if (body && body.stream === false && typeof body.temperature === "number" && body.temperature === 0) {
        maybeCacheSemanticResponse(body, modelStr, result.response, apiKey).catch(() => {});
      }
      return result.response;
    }

    // Stale: this panel call timed out — the fusion response already went to the
    // client, so skip the breaker-state write (markAccountUnavailable).
    if (signal?.aborted) {
      log.debug("CHAT", `[${provider}/${model}] skipping breaker update (panel call timed out)`);
      return result.response;
    }

    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)
    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs);

    if (shouldFallback) {
      log.warn("FALLBACK", `⇄ ACC:${credentials.connectionName} UNAVAILABLE (${result.status}) → NEXT ACCOUNT`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
